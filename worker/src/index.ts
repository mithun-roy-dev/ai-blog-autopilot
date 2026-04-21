import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { z } from 'zod'
import { WordPressService } from './services/wordpress.service'
import { SupabaseService } from './services/supabase.service'
import { IntelligenceService } from './services/intelligence.service'
import { ClusterService } from './services/cluster.service'
import { GenerationService } from './services/generation.service'
import { SchedulerService } from './services/scheduler.service'
import { PublisherService } from './services/publisher.service'
import { Logger } from './utils/logger'

// Load environment variables
dotenv.config()

const envSchema = z.object({
    SUPABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
})

async function processCrawlJob(job: any) {
    const { blogId } = job.payload
    console.log(`[Job ${job.id}] 🕷️ Starting crawl for blog: ${blogId}`)

    try {
        await SupabaseService.updateJobStatus(job.id, 'processing')

        // 1. Fetch blog details
        const supabase = SupabaseService.getClient()
        const { data: blog, error: blogError } = await supabase
            .from('blogs')
            .select('*')
            .eq('id', blogId)
            .single()

        if (blogError || !blog) throw new Error(`Blog not found: ${blogId}`)

        // 2. Content Discovery
        await SupabaseService.updateJobProgress(job.id, 10)
        let postCount = 0
        let pageCount = 0
        let categoryCount = 0
        let authorCount = 0
        let sitemapCount = 0

        console.log(`[Job ${job.id}] 📖 Processing ${blog.site_type} site: ${blog.url}`)

        // A. Always do Sitemap Discovery for all site types (for pages, categories, sitemaps tabs)
        console.log(`[Job ${job.id}] 🌐 Discovering content via sitemap...`)
        const sitemapData = await WordPressService.discoverSitemapData(blog.url)
        await SupabaseService.updateJobProgress(job.id, 30)
        
        // B. Fetch Posts/Pages via API if authenticated WordPress
        if (blog.site_type === 'wordpress' && blog.wp_api_key && blog.wp_username) {
            console.log(`[Job ${job.id}] 🔐 Fetching posts via WordPress REST API...`)
            await SupabaseService.updateJobProgress(job.id, 45)
            const wpPosts = await WordPressService.fetchContent(blog.url, 'posts', blog.wp_api_key, blog.wp_username)
            if (wpPosts.length > 0) {
                await SupabaseService.upsertArticles(job.user_id, blogId, wpPosts)
                postCount = wpPosts.length
            }
        } else {
            // Use sitemap-discovered posts if no API
            if (sitemapData.posts.length > 0) {
                console.log(`[Job ${job.id}] 🕷️ Fetching metadata for ${sitemapData.posts.length} discovered posts...`)
                await SupabaseService.updateJobProgress(job.id, 50)
                const postMetadata = await Promise.all(
                    sitemapData.posts.slice(0, 100).map(url => WordPressService.fetchUrlMetadata(url))
                )
                const postsToUpsert = sitemapData.posts.slice(0, 100).map((url, i) => ({ 
                    url, 
                    title: postMetadata[i].title,
                    excerpt: postMetadata[i].excerpt 
                }))
                await SupabaseService.upsertArticles(job.user_id, blogId, postsToUpsert)
                postCount = postsToUpsert.length
            }
        }

        // C. Populate other_contents table
        console.log(`[Job ${job.id}] 🕷️ Fetching metadata for ${sitemapData.pages.length} discovered pages...`)
        await SupabaseService.updateJobProgress(job.id, 70)
        const pageMetadata = await Promise.all(
            sitemapData.pages.slice(0, 50).map(url => WordPressService.fetchUrlMetadata(url))
        )

        const otherContentItems: any[] = [
            ...sitemapData.pages.slice(0, 50).map((url, i) => ({ 
                type: 'page', 
                url, 
                title: pageMetadata[i].title, 
                excerpt: pageMetadata[i].excerpt 
            })),
            ...sitemapData.categories.map(url => ({ type: 'category', url })),
            ...sitemapData.authors.map(url => ({ type: 'author', url })),
            ...sitemapData.sitemaps.map(url => ({ type: 'sitemap', url }))
        ]

        if (otherContentItems.length > 0) {
            console.log(`[Job ${job.id}] 💾 Storing ${otherContentItems.length} other content items...`)
            await SupabaseService.updateJobProgress(job.id, 90)
            await SupabaseService.upsertOtherContent(job.user_id, blogId, otherContentItems)
        }

        pageCount = Math.min(sitemapData.pages.length, 50)
        categoryCount = sitemapData.categories.length
        authorCount = sitemapData.authors.length
        sitemapCount = sitemapData.sitemaps.length

        // 3. Update Blog Metadata for visibility
        await SupabaseService.updateBlogMetadata(blogId, {
            last_sync: new Date().toISOString(),
            post_count: postCount,
            page_count: pageCount,
            category_count: categoryCount,
            author_count: authorCount,
            sitemap_count: sitemapCount,
            discovery_method: blog.wp_api_key && blog.wp_username ? "WordPress REST API + Sitemap" : "Exhaustive Sitemap Discovery"
        })

        await SupabaseService.updateJobProgress(job.id, 100)

        // 5. Update job status
        await SupabaseService.updateJobStatus(job.id, 'completed')
        console.log(`[Job ${job.id}] ✅ Crawl completed successfully!`)

    } catch (error: any) {
        console.error(`[Job ${job.id}] ❌ Crawl failed:`, error.message)
        await SupabaseService.updateJobStatus(job.id, 'failed', error.message)
    }
}

async function processIntelligenceJob(job: any) {
    const { blogId } = job.payload
    console.log(`[Job ${job.id}] 🧠 Starting intelligence gathering for blog: ${blogId}`)

    try {
        await SupabaseService.updateJobStatus(job.id, 'processing')

        const intelligenceService = new IntelligenceService()
        await intelligenceService.processSiteIntelligence(blogId)

        await SupabaseService.updateJobStatus(job.id, 'completed')
        console.log(`[Job ${job.id}] ✅ Intelligence gathering completed successfully!`)
    } catch (error: any) {
        console.error(`[Job ${job.id}] ❌ Intelligence gathering failed:`, error.message)
        await SupabaseService.updateJobStatus(job.id, 'failed', error.message)
    }
}

async function processClusterJob(job: any) {
    const { blogId } = job.payload
    console.log(`[Job ${job.id}] 📂 Starting cluster generation for blog: ${blogId}`)

    try {
        await SupabaseService.updateJobStatus(job.id, 'processing')

        const clusterService = new ClusterService()
        await clusterService.generateClusters(blogId, job.user_id)

        await SupabaseService.updateJobStatus(job.id, 'completed')
        console.log(`[Job ${job.id}] ✅ Cluster generation completed successfully!`)
    } catch (error: any) {
        console.error(`[Job ${job.id}] ❌ Cluster generation failed:`, error.message)
        await SupabaseService.updateJobStatus(job.id, 'failed', error.message)
    }
}

async function processArticleGenerationJob(job: any) {
    const { jobId } = job.payload
    console.log(`[Job ${job.id}] ✍️ Starting article generation for job: ${jobId}`)

    try {
        await SupabaseService.updateJobStatus(job.id, 'processing')

        // Hand off to GenerationService for the 6-step pipeline
        await GenerationService.processGeneration(jobId)

        await SupabaseService.updateJobStatus(job.id, 'completed')
        console.log(`[Job ${job.id}] ✅ Article generation job completed successfully!`)
    } catch (error: any) {
        console.error(`[Job ${job.id}] ❌ Article generation failed:`, error.message)
        await SupabaseService.updateJobStatus(job.id, 'failed', error.message)
    }
}

async function processLinkSlugsJob(job: any) {
    console.log(`[Job ${job.id}] 🔗 Starting link sync for payload:`, job.payload)
    await SupabaseService.syncSlugLinks(job.id, job.payload)
}

async function processSingleImageGenerationJob(job: any) {
    const { jobId, html } = job.payload
    console.log(`[Job ${job.id}] 🖼️ Starting single image generation...`)
    Logger.debug(`Job:${job.id}`, `processSingleImageGenerationJob: Starting...jobId=${jobId}, html=${html}`);

    try {
        await SupabaseService.updateJobStatus(job.id, 'processing')

        const publicUrl = await GenerationService.createSingleImage(jobId, html)

        const supabase = SupabaseService.getClient()
        await supabase.from('job_queue').update({
            status: 'completed',
            payload: { ...job.payload, publicUrl }
        }).eq('id', job.id)

        console.log(`[Job ${job.id}] ✅ Single image generation completed successfully! publicUrl=${publicUrl}`)
        Logger.debug(`Job:${job.id}`, `processSingleImageGenerationJob: Completed successfully! publicUrl=${publicUrl}`);
    } catch (error: any) {
        console.error(`[Job ${job.id}] ❌ Single image generation failed:`, error.message)
        Logger.debug(`Job:${job.id}`, `processSingleImageGenerationJob: Failed! error=${error.message}`);
        await SupabaseService.updateJobStatus(job.id, 'failed', error.message)
    }
}

async function pollJobs() {
    const supabase = SupabaseService.getClient()

    // Find the next queued job
    const { data: job, error } = await supabase
        .from('job_queue')
        .select('*')
        .eq('status', 'queued')
        .order('created_at', { ascending: true })
        .limit(1)
        .single()

    if (error || !job) {
        // No jobs to process
        return
    }

    if (job.type === 'crawl') {
        await processCrawlJob(job)
    } else if (job.type === 'intelligence_sync') {
        await processIntelligenceJob(job)
    } else if (job.type === 'cluster_generation') {
        await processClusterJob(job)
    } else if (job.type === 'article_generation') {
        await processArticleGenerationJob(job)
    } else if (job.type === 'link_slugs') {
        await processLinkSlugsJob(job)
    } else if (job.type === 'publish_article') {
        await PublisherService.publishArticle(job.id, job.payload)
    } else if (job.type === 'single_image_generation') {
        await processSingleImageGenerationJob(job)
    } else {
        console.warn(`[Job ${job.id}] ⚠️ Unknown job type: ${job.type}`)
        await SupabaseService.updateJobStatus(job.id, 'failed', `Unknown job type: ${job.type}`)
    }
}

async function main() {
    console.log('🚀 AI Blog Autopilot Worker starting...')

    try {
        envSchema.parse({
            SUPABASE_URL: process.env.SUPABASE_URL,
            SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
        })

        console.log('✅ Connected to Supabase')

        // Start polling loop
        console.log('🕵️ Polling for jobs...')
        setInterval(async () => {
            await pollJobs()
        }, 5000)

        // Start Scheduler loop (runs every 1 minute)
        console.log('⏰ Scheduler active (polling every 60s)...')
        setInterval(async () => {
            await SchedulerService.checkSchedules()
        }, 60000)

        // Heartbeat
        setInterval(() => {
            console.log(`💓 Heartbeat: ${new Date().toISOString()} - Worker active`)
        }, 60000)

    } catch (error) {
        if (error instanceof z.ZodError) {
            console.error('❌ Environment validation failed:', error.errors)
        } else {
            console.error('❌ Failed to initialize worker:', error)
        }

        console.log('⚠️ Running in restricted mode (waiting for environment variables...)')

        setInterval(() => {
            console.log(`💓 Heartbeat (Restricted): ${new Date().toISOString()} - Worker waiting for config`)
        }, 60000)
    }
}

main()
