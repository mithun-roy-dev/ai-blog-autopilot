import { createClient } from "@supabase/supabase-js"
import * as dotenv from "dotenv"
import * as path from "path"

dotenv.config({ path: path.resolve(__dirname, "../../.env") })

const url = process.env.SUPABASE_URL!
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(url, key)

const INITIAL_PROMPTS = [
    {
        name: "Content Brief Generator",
        slug: "content-brief",
        system_prompt: `You are an expert SEO Content Strategist. Your goal is to create a comprehensive content brief based on SERP analysis and user requirements.
Focus on:
1. Identifying the core intent (Informational, Transactional, etc.)
2. Structuring a perfect heading hierarchy (H2, H3)
3. Identifying key semantic keywords to include
4. Defining target word count and tone.`,
        user_prompt_template: `Keyword: {{keyword}}
Site Niche: {{niche}}
SERP Data: {{serp_data}}
Intent: {{intent}}

Generate a detailed content brief that will guide a writer to create a top-ranking article. Output should be JSON format.`,
        variables: ["keyword", "niche", "serp_data", "intent"]
    },
    {
        name: "Writer Agent",
        slug: "writer-agent",
        system_prompt: `You are a professional, high-authority blog writer specializing in {{niche}}. 
Your goal is to write a comprehensive, engaging, and SEO-optimized article based on the provided content brief.
Adhere strictly to:
- The heading structure provided.
- Natural keyword integration.
- Engaging introductions and strong conclusions.`,
        user_prompt_template: `Content Brief: {{content_brief}}
Target Keyword: {{keyword}}
Primary Intent: {{intent}}

Write the full article content now.`,
        variables: ["content_brief", "keyword", "intent", "niche"]
    }
]

async function seed() {
    console.log("🌱 Seeding initial prompts...")
    
    for (const prompt of INITIAL_PROMPTS) {
        const { error } = await supabase
            .from("ai_prompts")
            .upsert(prompt, { onConflict: 'slug' })
            
        if (error) {
            console.error(`❌ Error seeding ${prompt.slug}:`, error.message)
        } else {
            console.log(`✅ Seeded ${prompt.slug}`)
        }
    }
    
    console.log("✨ Seeding complete!")
}

seed().catch(console.error)
