"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ClusterService = void 0;
const axios_1 = __importDefault(require("axios"));
const supabase_service_1 = require("./supabase.service");
class ClusterService {
    supabase = new supabase_service_1.SupabaseService();
    async generateClusters(blogId, userId) {
        console.log(`[Clustering] Starting strategy generation for blog: ${blogId}`);
        try {
            // 1. Fetch AI Configuration (OpenRouter)
            const { data: config, error: configError } = await supabase_service_1.SupabaseService.getClient()
                .from('ai_configurations')
                .select('*')
                .eq('provider', 'openrouter')
                .single();
            if (configError || !config) {
                throw new Error("OpenRouter configuration not found. Please set it up in Admin settings.");
            }
            // 2. Fetch Site Intelligence (Existing Categories and Structure)
            const { data: intel, error: intelError } = await supabase_service_1.SupabaseService.getClient()
                .from('site_intelligence')
                .select('title, category, tags, url, h1')
                .eq('blog_id', blogId)
                .limit(100);
            if (intelError)
                throw intelError;
            // 3. Fetch Blog Info (Fallback Context)
            const { data: blog, error: blogError } = await supabase_service_1.SupabaseService.getClient()
                .from('blogs')
                .select('name, url, metadata')
                .eq('id', blogId)
                .single();
            if (blogError)
                throw blogError;
            // 4. Prepare Context for AI
            const existingCategories = Array.from(new Set(intel?.map(i => i.category).filter(Boolean) || []));
            const existingTopics = intel?.slice(0, 20).map(i => i.title).join(', ');
            const siteContext = {
                name: blog.name,
                url: blog.url,
                description: blog.metadata?.description || '',
                target_country: blog.metadata?.target_country || 'Global',
                existing_categories: existingCategories,
                sample_posts: existingTopics
            };
            console.log(`[Clustering] Context gathered. Requesting AI clusters...`);
            // 5. Call OpenRouter
            const prompt = this.getClusteringPrompt(siteContext);
            const response = await axios_1.default.post('https://openrouter.ai/api/v1/chat/completions', {
                model: config.default_model || 'openai/gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert SEO Content Strategist. Your goal is to create high-authority content clusters (Pillar-and-Spoke model).'
                    },
                    { role: 'user', content: prompt }
                ],
                response_format: { type: 'json_object' }
            }, {
                headers: {
                    'Authorization': `Bearer ${config.api_key}`,
                    'HTTP-Referer': 'https://ai-blog-autopilot.com',
                    'X-Title': 'AI Blog Autopilot'
                }
            });
            const aiResult = JSON.parse(response.data.choices[0].message.content);
            const clusters = aiResult.clusters || [];
            console.log(`[Clustering] AI generated ${clusters.length} clusters. Saving to DB...`);
            // 6. Save Clusters and Pages
            for (const clusterData of clusters) {
                // Insert Cluster
                const { data: cluster, error: cError } = await supabase_service_1.SupabaseService.getClient()
                    .from('content_clusters')
                    .insert({
                    user_id: userId,
                    blog_id: blogId,
                    topic: clusterData.category_topic,
                    intent: clusterData.intent,
                    strategy_summary: clusterData.strategy_summary,
                    status: 'completed'
                })
                    .select()
                    .single();
                if (cError) {
                    console.error("[Clustering] Failed to save cluster:", cError);
                    continue;
                }
                // Insert Pages (Pillar + Supporting)
                const pagesToInsert = [
                    {
                        cluster_id: cluster.id,
                        title: clusterData.pillar_content.title,
                        slug: clusterData.pillar_content.slug,
                        type: 'pillar',
                        word_count_target: clusterData.pillar_content.word_count_target || 3000,
                        status: 'not_generated'
                    },
                    ...clusterData.supporting_articles.map((art) => ({
                        cluster_id: cluster.id,
                        title: art.title,
                        slug: art.slug,
                        type: 'supporting',
                        word_count_target: art.word_count_target || 1200,
                        status: 'not_generated'
                    }))
                ];
                const { error: pError } = await supabase_service_1.SupabaseService.getClient()
                    .from('cluster_pages')
                    .insert(pagesToInsert);
                if (pError)
                    console.error("[Clustering] Failed to save pages:", pError);
            }
            console.log(`[Clustering] Successfully generated strategy for ${blog.name}`);
        }
        catch (err) {
            console.error(`[Clustering] Error:`, err.message);
            throw err;
        }
    }
    getClusteringPrompt(context) {
        return `
            Analyze the following website context and create 3 high-authority SEO Content Clusters.
            
            SITE CONTEXT:
            - Name: ${context.name}
            - URL: ${context.url}
            - Description: ${context.description}
            - Target Country: ${context.target_country}
            - Existing Categories: ${context.existing_categories.join(', ')}
            - Existing Content Topics: ${context.sample_posts}

            DIRECTIONS:
            1. Respect existing categories if they make sense, otherwise suggest superior ones.
            2. Each cluster must have 1 Pillar Content and 4-5 Supporting Articles.
            3. Pillar content should be "Ultimate Guide" style (2500-3000 words).
            4. Supporting articles should cover sub-intents and link back to the pillar.
            5. Ensure specific keyword targeting and logical slugs.
            
            OUTPUT FORMAT (JSON ONLY):
            {
              "clusters": [
                {
                  "category_topic": "Topic Name",
                  "intent": "Informational/Commercial/etc",
                  "strategy_summary": "1 sentence explanation",
                  "pillar_content": {
                    "title": "The Ultimate Guide to...",
                    "slug": "/guide-slug",
                    "word_count_target": 3000
                  },
                  "supporting_articles": [
                    { "title": "Subtopic Title", "slug": "/subtopic-slug", "word_count_target": 1200 },
                    ... 4 more
                  ]
                }
              ]
            }
        `;
    }
}
exports.ClusterService = ClusterService;
