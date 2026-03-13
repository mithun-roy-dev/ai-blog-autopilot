
import fs from 'fs'
import path from 'path'

const data = JSON.parse(fs.readFileSync('m:/pers/Projects/AI Blog Autopilot SaaS/ai-blog-autopilot/worker/temp_output_utf8.json', 'utf8').split('DATA_START')[1].split('DATA_END')[0].trim())

const { blog, job, page, clusterPages, prompt, intelligence, publishedArticles } = data

// 1. Construct site_context
const site_context = `
<site_context>
  <site_description_short>${blog.site_description || ''}</site_description_short>
  <site_niche>${blog.site_niche || ''}</site_niche>
</site_context>
`.trim()

// 2. Identify Pillar Page
const pillarPage = clusterPages.find(p => p.type === 'pillar')
const publishedClusterArticles = intelligence.filter(i => i.articles && i.status === 'completed') // Simple heuristic for published in cluster context

// 3. Logic for links_must
let links_must = ''
if (page.type === 'pillar') {
    // Top one from links_choice (placeholder logic for now)
    links_must = '<url>https://example.com/fallback-choice-1</url>' 
} else {
    // Supporting content: link to pillar
    if (pillarPage) {
        links_must = `<url>https://rabbitip.com${pillarPage.slug}</url>`
    } else {
        // Fallback to first available published article from same cluster
        const fallback = clusterPages.find(p => p.status === 'published' && p.id !== page.id)
        if (fallback) {
            links_must = `<url>https://rabbitip.com${fallback.slug}</url>`
        } else {
            links_must = '<url>https://rabbitip.com/blog/</url>'
        }
    }
}

// 4. Logic for links_choice (Merge site_intelligence + articles)
const uniqueLinks = new Map()
const addLink = (url, title) => {
    if (!url) return
    const fullUrl = url.startsWith('http') ? url : `https://rabbitip.com${url.startsWith('/') ? '' : '/'}${url}`
    if (!uniqueLinks.has(fullUrl)) {
        uniqueLinks.set(fullUrl, title)
    }
}

intelligence.forEach(i => addLink(i.url, i.title))
publishedArticles.forEach(a => addLink(a.source_url, a.title))

const links_choice = Array.from(uniqueLinks.entries())
    .slice(0, 30)
    .map(([url]) => `<url>${url}</url>`)
    .join('\n    ')

// 5. Construct article_target
const article_target = `
<article_target>
  <title>${job.title}</title>
  <keyword>${job.primary_keyword}</keyword>
  <category>${job.content_clusters.topic}</category>
  <intent>${job.content_clusters.intent}</intent>
  <words>${page.word_count_target}</words>
  <images>2</images>
  <links_must>
    ${links_must}
  </links_must>
  <links_choice>
    ${links_choice}
  </links_choice>
</article_target>
`.trim()

// 6. SERP Data Compression Logic
const compressSerp = (serp: any, analysis: any) => {
    return {
        avg_words: analysis?.average_word_count || 0,
        organic: (serp.organic_results || []).slice(0, 8).map((r: any) => ({
            t: r.title,
            s: (r.snippet || '').slice(0, 100)
        })),
        searches: (serp.related_searches || []).map((r: any) => r.query),
        questions: (serp.related_questions || []).map((r: any) => r.question),
        pages: (analysis?.pages || []).slice(0, 20).map((p: any) => ({
            h1: p.h1 || '',
            h2: p.h2 || [],
            h3: p.h3 || []
        }))
    }
}

const serp_data_xml = `
<serp_data>
${JSON.stringify(compressSerp(job.generation_data.serp, job.generation_data.analysis), null, 2)}
</serp_data>
`.trim()

// 7. Separate Outputs
const dynamic_xml = `${site_context}\n\n${article_target}\n\n${serp_data_xml}`
const full_user_message = `${dynamic_xml}\n\n${prompt.user_prompt_template}`

fs.writeFileSync('m:/pers/Projects/AI Blog Autopilot SaaS/ai-blog-autopilot/worker/temp_system_prompt.txt', prompt.system_prompt || '')
fs.writeFileSync('m:/pers/Projects/AI Blog Autopilot SaaS/ai-blog-autopilot/worker/temp_user_prompt.txt', full_user_message)

console.log("PROMPTS_GENERATED")
console.log("System Prompt: temp_system_prompt.txt")
console.log("User Prompt: temp_user_prompt.txt")
