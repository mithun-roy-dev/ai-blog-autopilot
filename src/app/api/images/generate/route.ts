import { createClient } from "@/utils/supabase/server"
import { NextResponse } from "next/server"

export const maxDuration = 60; // Max duration for Hobby/Pro plan

export async function POST(request: Request) {
    try {
        const supabase = await createClient()
        const { jobId, html } = await request.json()

        if (!jobId || !html) {
            return NextResponse.json({ error: "Job ID and HTML are required" }, { status: 400 })
        }

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        // Insert a new job into the job_queue
        const { data, error } = await supabase
            .from("job_queue")
            .insert([
                {
                    user_id: user.id,
                    type: "single_image_generation",
                    payload: { jobId, html },
                    status: "queued"
                }
            ])
            .select()

        if (error) throw error

        return NextResponse.json({ message: "Image generation job queued", job: data[0] })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}

export async function GET(request: Request) {
    try {
        const supabase = await createClient()
        const { searchParams } = new URL(request.url)
        const id = searchParams.get('id')

        if (!id) {
            return NextResponse.json({ error: "Job Queue ID is required" }, { status: 400 })
        }

        const { data: { user }, error: authError } = await supabase.auth.getUser()
        if (authError || !user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        // Check the status of the job
        const { data, error } = await supabase
            .from("job_queue")
            .select('*')
            .eq('id', id)
            .eq('user_id', user.id)
            .single()

        if (error) {
             // If not found, it might be an issue.
             throw error;
        }

        return NextResponse.json({ job: data })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
