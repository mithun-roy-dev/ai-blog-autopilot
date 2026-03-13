import { createClient, SupabaseClient } from "@supabase/supabase-js"
import dotenv from "dotenv"

dotenv.config()

export class SupabaseService {
    private static client: SupabaseClient

    static getClient(): SupabaseClient {
        if (!this.client) {
            const url = process.env.SUPABASE_URL!
            const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
            this.client = createClient(url, key)
        }
        return this.client
    }

    /**
     * Stores articles fetched from WordPress into the database.
     */
    static async upsertArticles(userId: string, blogId: string, articles: any[]) {
        const client = this.getClient()

        const formattedArticles = articles.map(article => ({
            user_id: userId,
            blog_id: blogId,
            title: article.title.rendered,
            excerpt: article.excerpt.rendered,
            content: article.content.rendered,
            slug: article.slug,
            source_url: article.link,
            status: "generated", // Default status for crawled content
        }))

        const { error } = await client
            .from("articles")
            .upsert(formattedArticles, { onConflict: "source_url" })

        if (error) throw error
    }

    /**
     * Updates the status of a job in the queue.
     */
    static async updateJobStatus(jobId: string, status: string, errorMessage?: string) {
        const client = this.getClient()
        const { error } = await client
            .from("job_queue")
            .update({ status, error_message: errorMessage, updated_at: new Date() })
            .match({ id: jobId })

        if (error) throw error
    }

    /**
     * Updates blog metadata with site insights (e.g., sitemap count).
     */
    static async updateBlogMetadata(blogId: string, metadata: any) {
        const client = this.getClient()
        const { error } = await client
            .from("blogs")
            .update({ metadata, updated_at: new Date() })
            .match({ id: blogId })

        if (error) throw error
    }

    /**
     * Promotes a completed writing job to a public article and updates site intelligence.
     */
    static async promoteJobToArticle(jobId: string) {
        const client = this.getClient()
        
        // 1. Fetch Job Data
        const { data: job, error: jobError } = await client
            .from('writing_jobs')
            .select('*')
            .eq('id', jobId)
            .single()

        if (jobError || !job) throw new Error(`Job not found for promotion: ${jobId}`)

        const genData = job.generation_data || {}
        const serpData = genData.serp || {}
        const intent = serpData.intent || 'Informational'
        
        // 2. Fetch or Create Article
        let articleId: string | undefined = undefined;
        
        // Find existing article by slug and blog_id
        const { data: existingArticle } = await client
            .from('articles')
            .select('id')
            .eq('slug', job.slug)
            .eq('blog_id', job.blog_id)
            .maybeSingle()

        if (existingArticle) {
            articleId = existingArticle.id;
            await client
                .from('articles')
                .update({
                    title: job.title,
                    content: job.content,
                    source_url: job.source_url || `internal://${job.slug}`,
                    status: 'generated',
                    updated_at: new Date()
                })
                .eq('id', articleId)
        } else {
            const { data: newArticle, error: createError } = await client
                .from('articles')
                .insert({
                    user_id: job.user_id,
                    blog_id: job.blog_id,
                    title: job.title,
                    content: job.content,
                    slug: job.slug,
                    source_url: job.source_url || `internal://${job.slug}`,
                    status: 'generated',
                    updated_at: new Date()
                })
                .select()
                .single()
            
            if (newArticle) articleId = newArticle.id;
            if (createError) console.error(`[Job ${jobId}] ❌ Failed to create article:`, createError.message);
        }
        
        // 3. Update site_intelligence
        const { data: existingIntel } = await client
            .from('site_intelligence')
            .select('id')
            .eq('blog_id', job.blog_id)
            .eq('title', job.title)
            .maybeSingle()

        if (existingIntel) {
            await client
                .from('site_intelligence')
                .update({
                    article_id: articleId,
                    url: job.slug ? `/${job.slug}` : '',
                    primary_keyword: job.primary_keyword,
                    intent: intent,
                    status: 'completed',
                    updated_at: new Date()
                })
                .eq('id', existingIntel.id)
        } else {
            const { error: insertIntelError } = await client
                .from('site_intelligence')
                .insert({
                    blog_id: job.blog_id,
                    article_id: articleId,
                    url: job.slug ? `/${job.slug}` : '',
                    title: job.title,
                    primary_keyword: job.primary_keyword,
                    intent: intent,
                    status: 'completed',
                    updated_at: new Date()
                })
            
            if (insertIntelError) console.error(`[Job ${jobId}] ⚠️ Failed to insert site intelligence:`, insertIntelError.message)
        }
    }
}
