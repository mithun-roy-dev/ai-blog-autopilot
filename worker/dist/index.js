"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = __importStar(require("dotenv"));
const zod_1 = require("zod");
const wordpress_service_1 = require("./services/wordpress.service");
const supabase_service_1 = require("./services/supabase.service");
// Load environment variables
dotenv.config();
const envSchema = zod_1.z.object({
    SUPABASE_URL: zod_1.z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: zod_1.z.string().min(1),
});
async function processCrawlJob(job) {
    const { blogId } = job.payload;
    console.log(`[Job ${job.id}] 🕷️ Starting crawl for blog: ${blogId}`);
    try {
        await supabase_service_1.SupabaseService.updateJobStatus(job.id, 'processing');
        // 1. Fetch blog details
        const supabase = supabase_service_1.SupabaseService.getClient();
        const { data: blog, error: blogError } = await supabase
            .from('blogs')
            .select('*')
            .eq('id', blogId)
            .single();
        if (blogError || !blog)
            throw new Error(`Blog not found: ${blogId}`);
        // 2. Fetch posts from WordPress
        console.log(`[Job ${job.id}] 📖 Fetching posts from: ${blog.url}`);
        const posts = await wordpress_service_1.WordPressService.fetchPosts(blog.url, blog.wp_api_key);
        // 3. Store articles in Supabase
        console.log(`[Job ${job.id}] 💾 Storing ${posts.length} articles...`);
        await supabase_service_1.SupabaseService.upsertArticles(job.user_id, blogId, posts);
        // 4. Update job status
        await supabase_service_1.SupabaseService.updateJobStatus(job.id, 'completed');
        console.log(`[Job ${job.id}] ✅ Crawl completed successfully!`);
    }
    catch (error) {
        console.error(`[Job ${job.id}] ❌ Crawl failed:`, error.message);
        await supabase_service_1.SupabaseService.updateJobStatus(job.id, 'failed', error.message);
    }
}
async function pollJobs() {
    const supabase = supabase_service_1.SupabaseService.getClient();
    // Find the next queued job
    const { data: job, error } = await supabase
        .from('job_queue')
        .select('*')
        .eq('status', 'queued')
        .order('created_at', { ascending: true })
        .limit(1)
        .single();
    if (error || !job) {
        // No jobs to process
        return;
    }
    if (job.type === 'crawl') {
        await processCrawlJob(job);
    }
    else {
        console.warn(`[Job ${job.id}] ⚠️ Unknown job type: ${job.type}`);
        await supabase_service_1.SupabaseService.updateJobStatus(job.id, 'failed', `Unknown job type: ${job.type}`);
    }
}
async function main() {
    console.log('🚀 AI Blog Autopilot Worker starting...');
    try {
        envSchema.parse({
            SUPABASE_URL: process.env.SUPABASE_URL,
            SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
        });
        console.log('✅ Connected to Supabase');
        // Start polling loop
        console.log('🕵️ Polling for jobs...');
        setInterval(async () => {
            await pollJobs();
        }, 5000);
        // Heartbeat
        setInterval(() => {
            console.log(`💓 Heartbeat: ${new Date().toISOString()} - Worker active`);
        }, 60000);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            console.error('❌ Environment validation failed:', error.errors);
        }
        else {
            console.error('❌ Failed to initialize worker:', error);
        }
        console.log('⚠️ Running in restricted mode (waiting for environment variables...)');
        setInterval(() => {
            console.log(`💓 Heartbeat (Restricted): ${new Date().toISOString()} - Worker waiting for config`);
        }, 60000);
    }
}
main();
