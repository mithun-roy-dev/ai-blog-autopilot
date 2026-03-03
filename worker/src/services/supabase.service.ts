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
}
