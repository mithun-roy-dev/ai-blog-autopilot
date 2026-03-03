import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'
import { z } from 'zod'

// Load environment variables
dotenv.config()

const envSchema = z.object({
    SUPABASE_URL: z.string().url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
})

function main() {
    console.log('🚀 AI Blog Autopilot Worker starting...')

    try {
        const env = envSchema.parse({
            SUPABASE_URL: process.env.SUPABASE_URL,
            SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
        })

        const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

        console.log('✅ Connected to Supabase')

        // Start heartbeat
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

        // Fallback heartbeat for local testing without credentials
        setInterval(() => {
            console.log(`💓 Heartbeat (Restricted): ${new Date().toISOString()} - Worker waiting for config`)
        }, 60000)
    }
}

main()
