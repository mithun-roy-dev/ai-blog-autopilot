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
     * Formats a slug to ensure it starts with / and optionally extracts from a URL.
     */
    private static formatSlug(input: string, isUrl: boolean = false): string {
        if (!input) return "";
        let slug = input;
        if (isUrl) {
            try {
                // Extract last non-empty segment from URL
                const url = new URL(input);
                const segments = url.pathname.split('/').filter(Boolean);
                slug = segments.length > 0 ? segments[segments.length - 1] : "";
            } catch {
                // Fallback to basic string split if URL parsing fails
                const segments = input.split('/').filter(Boolean);
                slug = segments.length > 0 ? segments[segments.length - 1] : "";
            }
        }

        // Ensure it starts with / and remove any leading slashes first to avoid //
        return `/${slug.replace(/^\/+/, '')}`;
    }

    /**
     * Stores articles (posts) fetched from WordPress or discovered via sitemap into the database.
     */
    static async upsertArticles(userId: string, blogId: string, articles: any[]) {
        const client = this.getClient()

        const formattedArticles = articles.map(article => ({
            user_id: userId,
            blog_id: blogId,
            title: article.title?.rendered || article.title || "Untitled Post",
            excerpt: article.excerpt?.rendered || article.excerpt || "",
            content: article.content?.rendered || article.content || "",
            slug: this.formatSlug(article.link || article.url, true),
            source_url: article.link || article.url,
            status: "crawled",
        }))

        if (formattedArticles.length === 0) return

        const { error } = await client
            .from("articles")
            .upsert(formattedArticles, { onConflict: "source_url" })

        if (error) throw error
    }

    /**
     * Stores other content types (page, category, author, sitemap) into the other_contents table.
     */
    static async upsertOtherContent(userId: string, blogId: string, items: { type: 'page' | 'category' | 'author' | 'sitemap', url: string, title?: string, excerpt?: string }[]) {
        const client = this.getClient()

        const formattedItems = items.map(item => ({
            user_id: userId,
            blog_id: blogId,
            type: item.type,
            title: item.title || item.url.split('/').filter(Boolean).pop() || 'Untitled',
            url: item.url,
            excerpt: item.excerpt || "",
            last_synced_at: new Date()
        }))

        if (formattedItems.length === 0) return

        const { error } = await client
            .from("other_contents")
            .upsert(formattedItems, { onConflict: "blog_id,url,type" })

        if (error) throw error
    }

    /**
     * Updates the progress percentage of a job.
     */
    static async updateJobProgress(jobId: string, progress: number) {
        const client = this.getClient()
        const { error } = await client
            .from("job_queue")
            .update({ progress, updated_at: new Date() })
            .eq("id", jobId)

        if (error) console.error(`[Job ${jobId}] ⚠️ Failed to update progress:`, error.message)
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
     * Promotes a completed writing job to a public article and updates site intelligence and cluster planning.
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

        // Format Slug
        const formattedSlug = this.formatSlug(job.slug);

        // Get Site URL for internal link
        const siteUrl = (process.env.SITE_URL || 'http://localhost:3000').replace(/\/+$/, '');
        const internalUrl = `${siteUrl}/dashboard/write/${job.id}`;

        // 2. Fetch or Create Article
        let articleId: string | undefined = undefined;

        // Find existing article by slug and blog_id
        const { data: existingArticle } = await client
            .from('articles')
            .select('id')
            .eq('slug', formattedSlug)
            .eq('blog_id', job.blog_id)
            .maybeSingle()

        if (existingArticle) {
            articleId = existingArticle.id;
            await client
                .from('articles')
                .update({
                    title: job.title,
                    content: job.content,
                    source_url: job.source_url || null,
                    internal_url: internalUrl || null,
                    status: 'generated',
                    cluster_id: job.cluster_id, // Link to cluster
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
                    slug: formattedSlug,
                    source_url: job.source_url || null,
                    internal_url: internalUrl || null,
                    status: 'generated',
                    cluster_id: job.cluster_id, // Link to cluster
                    updated_at: new Date()
                })
                .select()
                .single()

            if (newArticle) articleId = newArticle.id;
            if (createError) console.error(`[Job ${jobId}] ❌ Failed to create article:`, createError.message);
        }

        // 3. Update cluster_pages (if linked)
        if (job.page_id && articleId) {
            const { error: pageUpdateError } = await client
                .from('cluster_pages')
                .update({
                    status: 'generated',
                    article_id: articleId,
                    updated_at: new Date()
                })
                .eq('id', job.page_id)

            if (pageUpdateError) console.error(`[Job ${jobId}] ⚠️ Failed to update cluster_page status:`, pageUpdateError.message)
        }

        // 4. Update site_intelligence
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
                    url: formattedSlug,
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
                    url: formattedSlug,
                    title: job.title,
                    primary_keyword: job.primary_keyword,
                    intent: intent,
                    status: 'completed',
                    updated_at: new Date()
                })

            if (insertIntelError) console.error(`[Job ${jobId}] ⚠️ Failed to insert site intelligence:`, insertIntelError.message)
        }
    }

    /**
     * Synchronizes links between articles and cluster pages based on matching slugs.
     */
    static async syncSlugLinks(jobId: string, payload: { clusterPageId: string }) {
        const client = this.getClient();
        const { clusterPageId } = payload;

        console.log(`[Job ${jobId}] 🔗 Syncing links for cluster page: ${clusterPageId}`);

        try {
            // 1. Fetch the cluster page and its cluster info
            const { data: page, error: pageError } = await client
                .from('cluster_pages')
                .select('*, content_clusters(blog_id, user_id)')
                .eq('id', clusterPageId)
                .single();

            if (pageError || !page) throw new Error(`Cluster page not found: ${clusterPageId}`);

            const blogId = (page.content_clusters as any).blog_id;
            const normalizedSlug = this.formatSlug(page.slug);

            // 2. Search for matching article
            const { data: article, error: articleError } = await client
                .from('articles')
                .select('id, cluster_id, status')
                .eq('blog_id', blogId)
                .eq('slug', normalizedSlug)
                .maybeSingle();

            if (articleError) throw articleError;

            if (article) {
                console.log(`[Job ${jobId}] 🎯 Found matching article: ${article.id}`);

                // 3. Link both tables
                const updates = [];

                // Update cluster_pages with article_id and status if article is published
                let newStatus = page.status;
                if (article.status === 'published') {
                    newStatus = 'published';
                } else if (page.status === 'not_generated') {
                    newStatus = 'generated';
                }

                updates.push(
                    client
                        .from('cluster_pages')
                        .update({
                            article_id: article.id,
                            status: newStatus,
                            updated_at: new Date()
                        })
                        .eq('id', clusterPageId)
                );

                // Update articles with cluster_id
                updates.push(
                    client
                        .from('articles')
                        .update({
                            cluster_id: page.cluster_id,
                            updated_at: new Date()
                        })
                        .eq('id', article.id)
                );

                const results = await Promise.all(updates);
                for (const res of results) {
                    if (res.error) throw res.error;
                }

                console.log(`[Job ${jobId}] ✅ Successfully linked article ${article.id} to cluster page ${clusterPageId}`);
            } else {
                console.log(`[Job ${jobId}] 🍃 No matching article found for slug: ${normalizedSlug}`);
            }

            await this.updateJobStatus(jobId, 'completed');
        } catch (error: any) {
            console.error(`[Job ${jobId}] ❌ Sync failed:`, error.message);
            await this.updateJobStatus(jobId, 'failed', error.message);
        }
    }
}
