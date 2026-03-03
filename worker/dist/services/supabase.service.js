"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupabaseService = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
class SupabaseService {
    static client;
    static getClient() {
        if (!this.client) {
            const url = process.env.SUPABASE_URL;
            const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
            this.client = (0, supabase_js_1.createClient)(url, key);
        }
        return this.client;
    }
    /**
     * Stores articles fetched from WordPress into the database.
     */
    static async upsertArticles(userId, blogId, articles) {
        const client = this.getClient();
        const formattedArticles = articles.map(article => ({
            user_id: userId,
            blog_id: blogId,
            title: article.title.rendered,
            excerpt: article.excerpt.rendered,
            content: article.content.rendered,
            slug: article.slug,
            source_url: article.link,
            status: "generated", // Default status for crawled content
        }));
        const { error } = await client
            .from("articles")
            .upsert(formattedArticles, { onConflict: "source_url" });
        if (error)
            throw error;
    }
    /**
     * Updates the status of a job in the queue.
     */
    static async updateJobStatus(jobId, status, errorMessage) {
        const client = this.getClient();
        const { error } = await client
            .from("job_queue")
            .update({ status, error_message: errorMessage, updated_at: new Date() })
            .match({ id: jobId });
        if (error)
            throw error;
    }
}
exports.SupabaseService = SupabaseService;
