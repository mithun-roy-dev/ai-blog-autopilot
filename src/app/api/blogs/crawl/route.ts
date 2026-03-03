import { createClient } from "@/utils/supabase/server"
import { NextResponse } from "next/server"

export async function POST(request: Request) {
    try {
        const supabase = await createClient()
        const { blogId } = await request.json()

        if (!blogId) {
            return NextResponse.json({ error: "Blog ID is required" }, { status: 400 })
        }

        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        // Insert a new job into the job_queue
        const { data, error } = await supabase
            .from("job_queue")
            .insert([
                {
                    user_id: user.id,
                    type: "crawl",
                    payload: { blogId },
                    status: "queued"
                }
            ])
            .select()

        if (error) throw error

        return NextResponse.json({ message: "Crawl job queued", job: data[0] })
    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}
