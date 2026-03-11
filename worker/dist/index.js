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
const intelligence_service_1 = require("./services/intelligence.service");
const cluster_service_1 = require("./services/cluster.service");
const generation_service_1 = require("./services/generation.service");
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
        // 2. Fetch content based on site type and auth
        let allContent = [];
        let postCount = 0;
        let pageCount = 0;
        let sitemapUrls = [];
        console.log(`[Job ${job.id}] 📖 Processing ${blog.site_type} site: ${blog.url}`);
        if (blog.site_type === 'wordpress' && blog.wp_api_key && blog.wp_username) {
            // Priority 1: Authenticated WP REST API
            console.log(`[Job ${job.id}] 🔐 Fetching via WordPress REST API...`);
            const [posts, pages] = await Promise.all([
                wordpress_service_1.WordPressService.fetchContent(blog.url, 'posts', blog.wp_api_key, blog.wp_username),
                wordpress_service_1.WordPressService.fetchContent(blog.url, 'pages', blog.wp_api_key, blog.wp_username)
            ]);
            allContent = [...posts, ...pages];
            postCount = posts.length;
            pageCount = pages.length;
        }
        else {
            // Priority 2: Sitemap Discovery (for 'Other' sites or unauthenticated WP)
            console.log(`[Job ${job.id}] 🌐 Discovering content via sitemap...`);
            sitemapUrls = await wordpress_service_1.WordPressService.discoverSitemapUrls(blog.url);
            // Limit to first 100 for discovery depth
            const limitedUrls = sitemapUrls.slice(0, 100);
            console.log(`[Job ${job.id}] 🕷️ Fetching metadata for ${limitedUrls.length} discovered links...`);
            const metadataResults = await Promise.all(limitedUrls.map(url => wordpress_service_1.WordPressService.fetchUrlMetadata(url)));
            allContent = limitedUrls.map((url, index) => ({
                id: `sitemap-${index}`,
                title: { rendered: metadataResults[index].title },
                content: { rendered: '' },
                excerpt: { rendered: metadataResults[index].excerpt },
                link: url,
                slug: url.split('/').pop() || '',
                date: new Date().toISOString()
            }));
            // Treat sitemap-discovered links as posts for stat visibility
            postCount = allContent.length;
        }
        // 3. Update Blog Metadata for visibility
        await supabase_service_1.SupabaseService.updateBlogMetadata(blogId, {
            last_sync: new Date().toISOString(),
            post_count: postCount,
            page_count: pageCount,
            total_content: allContent.length,
            sitemap_links: sitemapUrls.length,
            discovery_method: blog.wp_api_key && blog.wp_username ? "WordPress REST API" : "Sitemap Discovery"
        });
        // 4. Store items in Supabase
        if (allContent.length > 0) {
            console.log(`[Job ${job.id}] 💾 Storing ${allContent.length} discovered items...`);
            await supabase_service_1.SupabaseService.upsertArticles(job.user_id, blogId, allContent);
        }
        // 5. Update job status
        await supabase_service_1.SupabaseService.updateJobStatus(job.id, 'completed');
        console.log(`[Job ${job.id}] ✅ Crawl completed successfully!`);
    }
    catch (error) {
        console.error(`[Job ${job.id}] ❌ Crawl failed:`, error.message);
        await supabase_service_1.SupabaseService.updateJobStatus(job.id, 'failed', error.message);
    }
}
async function processIntelligenceJob(job) {
    const { blogId } = job.payload;
    console.log(`[Job ${job.id}] 🧠 Starting intelligence gathering for blog: ${blogId}`);
    try {
        await supabase_service_1.SupabaseService.updateJobStatus(job.id, 'processing');
        const intelligenceService = new intelligence_service_1.IntelligenceService();
        await intelligenceService.processSiteIntelligence(blogId);
        await supabase_service_1.SupabaseService.updateJobStatus(job.id, 'completed');
        console.log(`[Job ${job.id}] ✅ Intelligence gathering completed successfully!`);
    }
    catch (error) {
        console.error(`[Job ${job.id}] ❌ Intelligence gathering failed:`, error.message);
        await supabase_service_1.SupabaseService.updateJobStatus(job.id, 'failed', error.message);
    }
}
async function processClusterJob(job) {
    const { blogId } = job.payload;
    console.log(`[Job ${job.id}] 📂 Starting cluster generation for blog: ${blogId}`);
    try {
        await supabase_service_1.SupabaseService.updateJobStatus(job.id, 'processing');
        const clusterService = new cluster_service_1.ClusterService();
        await clusterService.generateClusters(blogId, job.user_id);
        await supabase_service_1.SupabaseService.updateJobStatus(job.id, 'completed');
        console.log(`[Job ${job.id}] ✅ Cluster generation completed successfully!`);
    }
    catch (error) {
        console.error(`[Job ${job.id}] ❌ Cluster generation failed:`, error.message);
        await supabase_service_1.SupabaseService.updateJobStatus(job.id, 'failed', error.message);
    }
}
async function processArticleGenerationJob(job) {
    const { jobId } = job.payload;
    console.log(`[Job ${job.id}] ✍️ Starting article generation for job: ${jobId}`);
    try {
        await supabase_service_1.SupabaseService.updateJobStatus(job.id, 'processing');
        // Hand off to GenerationService for the 6-step pipeline
        await generation_service_1.GenerationService.processGeneration(jobId);
        await supabase_service_1.SupabaseService.updateJobStatus(job.id, 'completed');
        console.log(`[Job ${job.id}] ✅ Article generation job completed successfully!`);
    }
    catch (error) {
        console.error(`[Job ${job.id}] ❌ Article generation failed:`, error.message);
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
    else if (job.type === 'intelligence_sync') {
        await processIntelligenceJob(job);
    }
    else if (job.type === 'cluster_generation') {
        await processClusterJob(job);
    }
    else if (job.type === 'article_generation') {
        await processArticleGenerationJob(job);
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
