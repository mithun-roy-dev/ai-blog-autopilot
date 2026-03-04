import axios from 'axios';
import { SupabaseService } from './supabase.service';

export class ClusterService {
    private supabase = new SupabaseService();

    async generateClusters(blogId: string, userId: string) {
        console.log(`[Clustering] Starting strategy generation for blog: ${blogId}`);
        let config: any = null;

        try {
            // 1. Fetch AI Configuration (OpenRouter)
            const { data, error: configError } = await SupabaseService.getClient()
                .from('ai_configurations')
                .select('*')
                .eq('provider', 'openrouter')
                .single();

            config = data;

            if (configError || !config) {
                throw new Error("OpenRouter configuration not found. Please set it up in Admin settings.");
            }

            // 2. Fetch Site Intelligence (All Existing Posts)
            const { data: intel, error: intelError } = await SupabaseService.getClient()
                .from('site_intelligence')
                .select('title, category, tags, url, h1')
                .eq('blog_id', blogId)
                .order('created_at', { ascending: false }); // Fetch all, or a very large number

            if (intelError) throw intelError;

            // 3. Fetch Blog Info (Fallback Context)
            const { data: blog, error: blogError } = await SupabaseService.getClient()
                .from('blogs')
                .select('name, url, metadata')
                .eq('id', blogId)
                .single();

            if (blogError) throw blogError;

            // 4. Prepare Context for AI
            const existingCategories = Array.from(new Set(intel?.map(i => i.category).filter(Boolean) || []));
            const existingPosts = intel?.map(i => ({
                title: i.title,
                slug: this.extractSlug(i.url),
                category: i.category
            })) || [];

            const siteContext = {
                name: blog.name,
                url: blog.url,
                description: blog.metadata?.description || '',
                target_country: blog.metadata?.target_country || 'Global',
                existing_categories: existingCategories,
                existing_posts: existingPosts
            };

            console.log(`[Clustering] Context gathered. Requesting AI clusters...`);

            // 5. Call OpenRouter
            const prompt = this.getClusteringPrompt(siteContext);
            const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
                model: config.default_model || 'openai/gpt-3.5-turbo',
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert SEO Content Strategist. Your goal is to create high-authority content clusters (Pillar-and-Spoke model).'
                    },
                    { role: 'user', content: prompt }
                ]
            }, {
                headers: {
                    'Authorization': `Bearer ${config.api_key}`,
                    'HTTP-Referer': 'https://ai-blog-autopilot.com',
                    'X-Title': 'AI Blog Autopilot'
                }
            });

            const content = response.data.choices[0].message.content;
            const aiResult = this.extractJson(content);
            const clusters = aiResult.clusters || [];

            console.log(`[Clustering] AI generated ${clusters.length} clusters. Saving to DB...`);

            // 6. Save Clusters and Pages
            for (const clusterData of clusters) {
                // Insert Cluster
                const { data: cluster, error: cError } = await SupabaseService.getClient()
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
                        status: this.isExistingPost(clusterData.pillar_content.slug, existingPosts) ? 'published' : 'not_generated'
                    },
                    ...clusterData.supporting_articles.map((art: any) => ({
                        cluster_id: cluster.id,
                        title: art.title,
                        slug: art.slug,
                        type: 'supporting',
                        word_count_target: art.word_count_target || 1200,
                        status: this.isExistingPost(art.slug, existingPosts) ? 'published' : 'not_generated'
                    }))
                ];

                const { error: pError } = await SupabaseService.getClient()
                    .from('cluster_pages')
                    .insert(pagesToInsert);

                if (pError) console.error("[Clustering] Failed to save pages:", pError);
            }

            console.log(`[Clustering] Successfully generated strategy for ${blog.name}`);

        } catch (err: any) {
            if (err.isAxiosError) {
                console.error(`[Clustering] API Error (${err.response?.status}):`, err.response?.data || err.message);
                if (err.response?.status === 404) {
                    console.error("[Clustering] ⚠️ 404 Error: Please check if the OpenRouter endpoint or model name is correct.");
                }
            } else {
                console.error(`[Clustering] Error:`, err.message);
            }
            throw err;
        }
    }

    private getClusteringPrompt(context: any) {
        return `
            Analyze the following website context and architect a comprehensive Content Strategy with AT LEAST 5 clusters.
            
            SITE CONTEXT:
            - Name: ${context.name}
            - URL: ${context.url}
            - Description: ${context.description}
            - Target Country: ${context.target_country}
            - Existing Categories: ${context.existing_categories.join(', ')}
            - Existing Articles: ${JSON.stringify(context.existing_posts.slice(0, 50))} (Truncated if > 50)

            DIRECTIONS:
            1. Create AT LEAST 5 high-authority Content Clusters.
            2. For each cluster, use "Existing Categories" as the foundation where relevant.
            3. MANDATORY: Incorporate ALL "Existing Articles" provided above into their respective clusters. 
            4. If an existing article belongs to a cluster, use its exact Title and Slug.
            5. For content gaps, suggest NEW "Write" ideas (Pillars or Support articles) to build topical authority.
            6. Each cluster must have 1 Pillar Content and 4-5 Supporting Articles (mix of existing and new).
            7. Pillars should be broad "Ultimate Guides" (2500-3000 words).
            
            OUTPUT FORMAT (JSON ONLY, NO MARKDOWN BACKTICKS):
            {
              "clusters": [
                {
                  "category_topic": "Topic Name",
                  "intent": "Informational/Commercial/etc",
                  "strategy_summary": "1 sentence explanation",
                  "pillar_content": {
                    "title": "Title",
                    "slug": "/slug",
                    "word_count_target": 3000
                  },
                  "supporting_articles": [
                    { "title": "Title", "slug": "/slug", "word_count_target": 1200 },
                    ... 4 more
                  ]
                }
              ]
            }
        `;
    }

    private extractSlug(url: string) {
        try {
            const path = new URL(url).pathname;
            return path === '/' ? '/' : path.replace(/\/$/, '');
        } catch (e) {
            return url;
        }
    }

    private isExistingPost(slug: string, existingPosts: any[]) {
        const normalizedSlug = slug.replace(/\/$/, '').toLowerCase();
        return existingPosts.some(p => {
            const pSlug = p.slug.replace(/\/$/, '').toLowerCase();
            return pSlug === normalizedSlug || normalizedSlug.includes(pSlug) || pSlug.includes(normalizedSlug);
        });
    }

    private extractJson(text: string) {
        try {
            // Try direct parse first
            return JSON.parse(text);
        } catch (e: any) {
            // Try to extract from markdown backticks
            const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (match && match[1]) {
                try {
                    return JSON.parse(match[1]);
                } catch (e2: any) {
                    throw new Error("Found JSON block but failed to parse it: " + e2.message);
                }
            }
            throw new Error("Failed to parse AI response as JSON. Response length: " + text.length);
        }
    }
}
