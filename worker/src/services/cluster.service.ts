import axios from 'axios';
import { SupabaseService } from './supabase.service';
import { Logger } from '../utils/logger';

export class ClusterService {
    private supabase = new SupabaseService();

    async generateClusters(blogId: string, userId: string) {
        console.log(`[Clustering] Starting strategy generation for blog: ${blogId}`);
        const context_tag = `Clustering:${blogId}`;
        let config: any = null;

        try {
            // 1. Fetch AI Configuration (OpenRouter)
            Logger.debug(context_tag, "FETCH_AI_CONFIG_START");
            const { data: config, error: configError } = await SupabaseService.getClient()
                .from('ai_configurations')
                .select('*')
                .eq('provider', 'openrouter')
                .single();

            if (configError || !config) {
                Logger.error(context_tag, "FETCH_AI_CONFIG_FAILED", configError);
                throw new Error("OpenRouter configuration not found. Please set it up in Admin settings.");
            }
            Logger.debug(context_tag, "FETCH_AI_CONFIG_SUCCESS", { model: config.default_model });

            // 2. Fetch Site Intelligence (All Existing Posts)
            Logger.debug(context_tag, "FETCH_SITE_INTEL_START");
            const { data: intel, error: intelError } = await SupabaseService.getClient()
                .from('site_intelligence')
                .select('title, category, tags, url, h1')
                .eq('blog_id', blogId)
                .order('created_at', { ascending: false });

            if (intelError) {
                Logger.error(context_tag, "FETCH_SITE_INTEL_FAILED", intelError);
                throw intelError;
            }
            Logger.debug(context_tag, "FETCH_SITE_INTEL_SUCCESS", { count: intel?.length });

            // 3. Fetch Blog Info (Dynamic Context)
            Logger.debug(context_tag, "FETCH_BLOG_INFO_START");
            const { data: blog, error: blogError } = await SupabaseService.getClient()
                .from('blogs')
                .select('name, url, site_description, target_country')
                .eq('id', blogId)
                .single();

            if (blogError) {
                Logger.error(context_tag, "FETCH_BLOG_INFO_FAILED", blogError);
                throw blogError;
            }
            Logger.debug(context_tag, "FETCH_BLOG_INFO_SUCCESS", { name: blog.name, target_country: blog.target_country });

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
                description: blog.site_description || '',
                target_country: blog.target_country || 'Global',
                existing_categories: existingCategories,
                existing_posts: existingPosts
            };

            Logger.debug(context_tag, "SITE_CONTEXT_PREPARED", siteContext);

            console.log(`[Clustering] Context gathered. Requesting AI clusters...`);

            // 5. Call OpenRouter
            const prompt = this.getClusteringPrompt(siteContext);

            // Log Request to debug_log.txt
            Logger.debug(context_tag, "CLUSTERING_AI_PROMPT_REQUEST", { prompt });
            const aiModel = config.default_model || 'openai/gpt-3.5-turbo';
            const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
                model: aiModel,
                messages: [
                    {
                        role: 'system',
                        content: `You are a senior SEO Content Strategist with 10+ years of experience building topical authority for niche websites. Your expertise includes:
                        - Semantic SEO and topic cluster architecture
                        - Search intent classification (informational, navigational, commercial, transactional)
                        - Keyword gap analysis and content cannibalization prevention
                        - E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness) content planning

                        Your job is to architect data-driven Content Cluster strategies that maximize topical authority, improve internal linking structure, and help websites rank for their core topic space.

                        RULES YOU MUST ALWAYS FOLLOW:
                        1. Output ONLY valid JSON — no markdown, no backticks, no preamble, no explanation.
                        2. Never invent or hallucinate article slugs. For existing articles, copy Title and Slug EXACTLY as provided.
                        3. Never duplicate an existing article across multiple clusters. Each article belongs to exactly ONE cluster.
                        4. Every cluster must have exactly 1 Pillar and between 4–6 Supporting Articles.
                        5. Supporting articles must be a MIX of existing (copied exactly) and new (clearly marked).
                        6. New articles must fill real topical gaps — not restate existing content.
                        7. Pillar articles must be broad enough to internally link to ALL supporting articles in its cluster.
                        8. Prioritize clusters where the site already has the most existing content first.`
                    },
                    { role: 'user', content: prompt }
                ]
            }, {
                headers: {
                    'Authorization': `Bearer ${config.api_key}`,
                    'HTTP-Referer': process.env.SITE_URL || 'https://ai-blog-autopilot.com',
                    'X-Title': 'AI Blog Autopilot'
                }
            });

            const content = response.data.choices[0].message.content;
            Logger.debug(context_tag, "AI_RAW_RESPONSE_RECEIVED", { content });

            const aiResult = this.extractJson(content);
            const clusters = aiResult.clusters || [];

            console.log(`[Clustering] AI generated ${clusters.length} clusters. Saving to DB...`);
            Logger.debug(context_tag, "AI_RESULT_PARSED", { cluster_count: clusters.length });

            // 6. Save Clusters and Pages
            for (const clusterData of clusters) {
                // Insert Cluster
                Logger.debug(context_tag, "SAVE_CLUSTER_START", { topic: clusterData.category_topic });
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
                    Logger.error(context_tag, "SAVE_CLUSTER_FAILED", { topic: clusterData.category_topic, error: cError });
                    continue;
                }
                Logger.debug(context_tag, "SAVE_CLUSTER_SUCCESS", { cluster_id: cluster.id });

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

                Logger.debug(context_tag, "SAVE_CLUSTER_PAGES_START", { count: pagesToInsert.length });
                const { error: pError } = await SupabaseService.getClient()
                    .from('cluster_pages')
                    .insert(pagesToInsert)
                    .select();

                if (pError) {
                    Logger.error(context_tag, "SAVE_CLUSTER_PAGES_FAILED", { cluster_id: cluster.id, error: pError });
                } else {
                    Logger.debug(context_tag, "SAVE_CLUSTER_PAGES_SUCCESS", { cluster_id: cluster.id });
                }
            }

            console.log(`[Clustering] Successfully generated strategy for ${blog.name}`);
            Logger.info(context_tag, "CLUSTERING_COMPLETED_SUCCESSFULLY");

        } catch (err: any) {
            Logger.error(context_tag, "CLUSTERING_SERVICE_CRITICAL_FAILURE", err);
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
        const existingPostsJson = JSON.stringify(context.existing_posts.slice(0, 50), null, 0);

        return `
                TASK: Build a complete Content Cluster Strategy for the website below. Achieve full topical authority coverage.

                === SITE PROFILE ===
                Name: ${context.name}
                URL: ${context.url}
                Description: ${context.description}
                Target Audience: ${context.target_country}
                Existing Categories: ${context.existing_categories.join(', ')}

                === EXISTING ARTICLES (copy Title + Slug EXACTLY when referencing) ===
                ${existingPostsJson}

                === INSTRUCTIONS ===

                STEP 1 — AUDIT: Mentally group all existing articles into logical topic clusters.
                STEP 2 — GAP ANALYSIS: Identify what subtopics are missing from each cluster to achieve full topical coverage.
                STEP 3 — ARCHITECT: Build AT LEAST 6 clusters. Prioritize clusters that already have the most existing content.
                STEP 4 — OUTPUT: Respond ONLY with the JSON structure below.

                CLUSTER RULES:
                - Each cluster = 1 Pillar + 4 to 6 Supporting Articles
                - Pillar = broad "Ultimate Guide" covering the full cluster topic (target: 2500–3000 words)
                - Supporting Articles = deep-dives on subtopics (target: 1000–1500 words)
                - Supporting articles should be a mix of EXISTING (from the list above) and NEW (gap-filling)
                - For EXISTING articles: copy "title" and "slug" exactly, set "status": "existing"
                - For NEW articles: write a new optimized title and slug, set "status": "new"
                - If a Pillar already exists on the site, use it; otherwise mark it "new"
                - Assign each existing article to exactly ONE cluster — no duplicates across clusters

                INTENT CLASSIFICATION (use one per cluster):
                - "Informational" — How-to, guides, educational
                - "Commercial Investigation" — Reviews, comparisons, best-of lists
                - "Transactional" — Buying, adopting, acquiring
                - "Mixed" — Combination of informational + commercial

                === OUTPUT FORMAT (JSON ONLY) ===
                {
                "clusters": [
                    {
                    "cluster_id": 1,
                    "category_topic": "Short topic name",
                    "intent": "Informational",
                    "strategy_summary": "One sentence describing why this cluster builds topical authority.",
                    "coverage_score": "High | Medium | Low (based on how many existing articles already cover this cluster)",
                    "pillar_content": {
                        "title": "The Ultimate Guide to [Topic]",
                        "slug": "/slug-here",
                        "word_count_target": 3000,
                        "status": "existing | new",
                        "focus_keyword": "primary keyword",
                        "internal_links_to_support": ["list of supporting slugs this pillar should link to"]
                    },
                    "supporting_articles": [
                        {
                        "title": "Article Title",
                        "slug": "/slug-here",
                        "word_count_target": 1200,
                        "status": "existing | new",
                        "focus_keyword": "keyword",
                        "content_gap_filled": "One sentence explaining what gap this fills (for new articles only)"
                        }
                    ]
                    }
                ],
                "unassigned_articles": [],
                "total_existing_assigned": 0,
                "total_new_recommended": 0
                }

                CRITICAL FINAL CHECK before outputting:
                - Are ALL ${context.existing_posts.length} existing articles assigned to exactly one cluster?
                - Does every cluster have between 4–6 supporting articles?
                - Is every existing article's title and slug copied exactly?
                - Is the output valid JSON with no markdown formatting?
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
