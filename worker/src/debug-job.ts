
import { createClient } from "@supabase/supabase-js"
import dotenv from "dotenv"

dotenv.config()

const url = process.env.SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(url, key)

async function debugJob(jobId: string) {
    console.log(`--- Debugging Job: ${jobId} ---`)
    
    const { data: job, error: jobError } = await supabase
        .from('writing_jobs')
        .select('*')
        .eq('id', jobId)
        .single()
    
    if (jobError) {
        console.error("Error fetching job:", jobError)
        return
    }
    
    console.log("Job Status:", job.status)
    console.log("Generation Status:", job.generation_status)
    console.log("Blog ID:", job.blog_id)
    
    const { data: blog, error: blogError } = await supabase
        .from('blogs')
        .select('id, name, writing_mode')
        .eq('id', job.blog_id)
        .single()
        
    if (blogError) {
        console.error("Error fetching blog:", blogError)
    } else {
        console.log("Blog Writing Mode:", blog.writing_mode)
    }
}

const jobId = process.argv[2]
if (jobId) {
    debugJob(jobId)
} else {
    console.log("Please provide a jobId")
}
