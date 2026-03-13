
import { createClient } from "@supabase/supabase-js"
import dotenv from "dotenv"

dotenv.config({ path: 'm:/pers/Projects/AI Blog Autopilot SaaS/ai-blog-autopilot/worker/.env' })

const url = process.env.SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(url, key)

async function fetchData() {
    // 1. Find Blog
    const { data: blogs, error: blogError } = await supabase
        .from('blogs')
        .select('*')
        .ilike('name', '%rabbitip%')
        .limit(1)

    if (blogError) {
        console.error("Blog Error:", blogError)
        return
    }
    const blog = blogs?.[0]
    if (!blog) {
        console.log("Blog 'rabbitip' not found.")
        // Try listing all blogs to be sure
        const { data: allBlogs } = await supabase.from('blogs').select('name').limit(10)
        console.log("Available blogs:", allBlogs?.map(b => b.name))
        return
    }
    console.log("Found Blog:", blog.name, "ID:", blog.id)

    // 2. Find Writing Job by Slug
    const { data: jobs, error: jobError } = await supabase
        .from('writing_jobs')
        .select('*, content_clusters(*)')
        .eq('blog_id', blog.id)
        .eq('slug', '/can-rabbits-eat-strawberries')
        .limit(1)

    if (jobError) {
        console.error("Job Error:", jobError)
        return
    }
    const job = jobs?.[0]
    if (!job) {
        console.log("Job with slug '/can-rabbits-eat-strawberries' not found for this blog.")
        // Try listing some slugs
        const { data: someJobs } = await supabase.from('writing_jobs').select('slug').eq('blog_id', blog.id).limit(10)
        console.log("Some slugs for this blog:", someJobs?.map(j => j.slug))
        return
    }
    console.log("Found Job ID:", job.id)

    // 3. Fetch Cluster Page info
    const { data: page } = await supabase
        .from('cluster_pages')
        .select('*')
        .eq('id', job.page_id)
        .single()

    // 4. Fetch Stored Prompt
    const { data: prompt } = await supabase
        .from('ai_prompts')
        .select('*')
        .eq('slug', 'content-brief')
        .eq('is_published', true)
        .single()

    // 5. Fetch Internal Links (site_intelligence)
    const { data: intelligence } = await supabase
        .from('site_intelligence')
        .select('*, articles(title, source_url)')
        .eq('blog_id', blog.id)
        .limit(50)

    // 6. Fetch Published Articles for this blog
    const { data: publishedArticles } = await supabase
        .from('articles')
        .select('title, source_url')
        .eq('blog_id', blog.id)
        .eq('status', 'published')
        .limit(50)

    console.log("DATA_START")
    console.log(JSON.stringify({
        blog,
        job,
        page,
        prompt,
        intelligence: intelligence || [],
        publishedArticles: publishedArticles || []
    }, null, 2))
    console.log("DATA_END")
}

fetchData()
