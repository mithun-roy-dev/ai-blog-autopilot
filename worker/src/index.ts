import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { z } from 'zod'
import { WordPressService } from './services/wordpress.service'
import { SupabaseService } from './services/supabase.service'
import { IntelligenceService } from './services/intelligence.service'

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

        // 2. Fetch content based on site type and auth
        let allContent: any[] = []
        let postCount = 0
        let pageCount = 0
        let sitemapUrls: string[] = []

        console.log(`[Job ${job.id}] 📖 Processing ${blog.site_type} site: ${blog.url}`)

        if (blog.site_type === 'wordpress' && blog.wp_api_key && blog.wp_username) {
            // Priority 1: Authenticated WP REST API
            console.log(`[Job ${job.id}] 🔐 Fetching via WordPress REST API...`)
            const [posts, pages] = await Promise.all([
                WordPressService.fetchContent(blog.url, 'posts', blog.wp_api_key, blog.wp_username),
                WordPressService.fetchContent(blog.url, 'pages', blog.wp_api_key, blog.wp_username)
            ])
            allContent = [...posts, ...pages]
            postCount = posts.length
            pageCount = pages.length
        } else {
            // Priority 2: Sitemap Discovery (for 'Other' sites or unauthenticated WP)
            console.log(`[Job ${job.id}] 🌐 Discovering content via sitemap...`)
            sitemapUrls = await WordPressService.discoverSitemapUrls(blog.url)

            // Limit to first 100 for discovery depth
            const limitedUrls = sitemapUrls.slice(0, 100)
            console.log(`[Job ${job.id}] 🕷️ Fetching metadata for ${limitedUrls.length} discovered links...`)

            const metadataResults = await Promise.all(
                limitedUrls.map(url => WordPressService.fetchUrlMetadata(url))
            )

            allContent = limitedUrls.map((url, index) => ({
                id: `sitemap-${index}`,
                title: { rendered: metadataResults[index].title },
                content: { rendered: '' },
                excerpt: { rendered: metadataResults[index].excerpt },
                link: url,
                slug: url.split('/').pop() || '',
                date: new Date().toISOString()
            }))

            // Treat sitemap-discovered links as posts for stat visibility
            postCount = allContent.length
        }

        // 3. Update Blog Metadata for visibility
        await SupabaseService.updateBlogMetadata(blogId, {
            last_sync: new Date().toISOString(),
            post_count: postCount,
            page_count: pageCount,
            total_content: allContent.length,
            sitemap_links: sitemapUrls.length,
            discovery_method: blog.wp_api_key && blog.wp_username ? "WordPress REST API" : "Sitemap Discovery"
        })

        // 4. Store items in Supabase
        if (allContent.length > 0) {
            console.log(`[Job ${job.id}] 💾 Storing ${allContent.length} discovered items...`)
            await SupabaseService.upsertArticles(job.user_id, blogId, allContent)
        }

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
