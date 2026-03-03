import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { z } from 'zod'
import { WordPressService } from './services/wordpress.service'
import { SupabaseService } from './services/supabase.service'

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

        // 2. Fetch posts from WordPress
        console.log(`[Job ${job.id}] 📖 Fetching posts from: ${blog.url}`)
        const posts = await WordPressService.fetchPosts(blog.url, blog.wp_api_key)

        // 3. Store articles in Supabase
        console.log(`[Job ${job.id}] 💾 Storing ${posts.length} articles...`)
        await SupabaseService.upsertArticles(job.user_id, blogId, posts)

        // 4. Update job status
        await SupabaseService.updateJobStatus(job.id, 'completed')
        console.log(`[Job ${job.id}] ✅ Crawl completed successfully!`)

    } catch (error: any) {
        console.error(`[Job ${job.id}] ❌ Crawl failed:`, error.message)
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
