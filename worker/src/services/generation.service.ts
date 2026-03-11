import axios from 'axios';
import { SupabaseService } from './supabase.service';
import * as cheerio from 'cheerio';

export class GenerationService {
    /**
     * Orchestrates the 6-step article generation process.
     */
    static async processGeneration(jobId: string) {
        console.log(`[Job ${jobId}] 🚀 Starting article generation pipeline...`);

        try {
            const supabase = SupabaseService.getClient();

            // 1. Fetch Job and Keyword
            const { data: job, error: jobError } = await supabase
                .from('writing_jobs')
                .select('*')
                .eq('id', jobId)
                .single();

            if (jobError || !job) throw new Error(`Job not found: ${jobId}`);

            // Step 1: SERP API Calling
            await this.executeStep(jobId, 'serp_calling', async () => {
                return await this.step1SerpApi(job);
            });

            // Step 2: SERP Analyzer
            await this.executeStep(jobId, 'serp_analyzing', async () => {
                const updatedJobData = await this.getGenerationData(jobId);
                return await this.step2SerpAnalyzer(job, updatedJobData);
            });

            // Future steps will be implemented here...

            // Move to the next step so the UI properly animates and shows Step 2 as completed
            await supabase
                .from('writing_jobs')
                .update({ generation_status: 'briefing', updated_at: new Date() })
                .eq('id', jobId);

            console.log(`[Job ${jobId}] ⏸️ Pausing before Content Brief generation (Step 3 not yet implemented)`);

        } catch (error: any) {
            console.error(`[Job ${jobId}] ❌ Generation failed:`, error.message);
            const supabase = SupabaseService.getClient();
            await supabase
                .from('writing_jobs')
                .update({
                    status: 'failed',
                    generation_status: 'failed',
                    error_message: error.message,
                    updated_at: new Date()
                })
                .eq('id', jobId);
        }
    }

    private static async executeStep(jobId: string, stepId: string, stepFn: () => Promise<any>) {
        const supabase = SupabaseService.getClient();
        const startedAt = new Date().toISOString();

        console.log(`[Job ${jobId}] 🔄 Executing step: ${stepId}...`);

        // Update status to current step
        await supabase
            .from('writing_jobs')
            .update({
                generation_status: stepId,
                generation_progress: {
                    ...(await this.getProgress(jobId)),
                    [stepId]: { status: 'processing', started_at: startedAt }
                },
                updated_at: new Date()
            })
            .eq('id', jobId);

        try {
            const result = await stepFn();
            const finishedAt = new Date().toISOString();

            // Update with results
            await supabase
                .from('writing_jobs')
                .update({
                    generation_data: {
                        ...(await this.getGenerationData(jobId)),
                        ...result.dataUpdate
                    },
                    generation_progress: {
                        ...(await this.getProgress(jobId)),
                        [stepId]: { status: 'completed', started_at: startedAt, finished_at: finishedAt }
                    },
                    updated_at: new Date()
                })
                .eq('id', jobId);

            return result;
        } catch (error: any) {
            // Step failure
            await supabase
                .from('writing_jobs')
                .update({
                    generation_progress: {
                        ...(await this.getProgress(jobId)),
                        [stepId]: { status: 'failed', error: error.message, started_at: startedAt }
                    },
                    updated_at: new Date()
                })
                .eq('id', jobId);
            throw error;
        }
    }

    private static async getProgress(jobId: string) {
        const supabase = SupabaseService.getClient();
        const { data } = await supabase.from('writing_jobs').select('generation_progress').eq('id', jobId).single();
        return data?.generation_progress || {};
    }

    private static async getGenerationData(jobId: string) {
        const supabase = SupabaseService.getClient();
        const { data } = await supabase.from('writing_jobs').select('generation_data').eq('id', jobId).single();
        return data?.generation_data || {};
    }

    /**
     * Step 1: SERP API Calling
     */
    private static async step1SerpApi(job: any) {
        const supabase = SupabaseService.getClient();

        // Fetch API Key from configurations
        const { data: config, error: configError } = await supabase
            .from('ai_configurations')
            .select('api_key')
            .eq('provider', 'serpapi')
            .single();

        if (configError || !config?.api_key) {
            throw new Error("SerpAPI key not configured in Admin settings.");
        }

        const keyword = job.primary_keyword;
        const NUMBER_TOP_SERP_SITE = 10;

        console.log(`[Job ${job.id}] 🔍 Calling SerpAPI for keyword: "${keyword}"`);

        const response = await axios.get('https://serpapi.com/search', {
            params: {
                engine: "google",
                q: keyword,
                api_key: config.api_key,
                num: NUMBER_TOP_SERP_SITE,
                location: "United States",
                gl: "us",
                hl: "en"
            }
        });

        const data = response.data;

        // --- Organic Results ---
        const organic_results = (data.organic_results || []).slice(0, NUMBER_TOP_SERP_SITE).map((item: any) => ({
            position: item.position,
            title: item.title,
            link: item.link,
            snippet: item.snippet
        }));

        // --- Related Questions ---
        const related_questions = (data.related_questions || []).slice(0, NUMBER_TOP_SERP_SITE).map((q: any) => ({
            question: q.question,
            type: q.type,
            title: q.title,
            snippet: q.snippet
        }));

        // --- Related Searches ---
        const related_searches = (data.related_searches || []).slice(0, NUMBER_TOP_SERP_SITE).map((rs: any) => ({
            query: rs.query
        }));

        // --- Keyword Intent ---
        let intent = "Informational";
        if (data.answer_box) intent = "Informational (Direct Answer)";
        if (data.shopping_results) intent = "Transactional";
        if (data.local_results) intent = "Local";
        if (data.video_results) intent = "Visual/Tutorial";

        return {
            dataUpdate: {
                serp: {
                    organic_results,
                    related_questions,
                    related_searches,
                    intent
                }
            }
        };
    }

    /**
     * Step 2: SERP Analyzer (Crawl, Extract SEO tags & Word Counts)
     */
    private static async step2SerpAnalyzer(job: any, data: any) {
        console.log(`[Job ${job.id}] 🖥️ Starting SERP analysis for ${data.serp?.organic_results?.length || 0} organic links...`);

        // Fetch Crawl Setup Limits
        const supabase = SupabaseService.getClient();
        const { data: crawlConfig } = await supabase
            .from('system_settings')
            .select('value')
            .eq('key', 'serp_crawl_config')
            .single();

        const limits = {
            max_h2: crawlConfig?.value?.max_h2 ?? 30,
            max_h3: crawlConfig?.value?.max_h3 ?? 30,
            max_h4: crawlConfig?.value?.max_h4 ?? 20,
            max_h5: crawlConfig?.value?.max_h5 ?? 2,
            max_h6: crawlConfig?.value?.max_h6 ?? 2
        };

        const organicLinks = data.serp?.organic_results || [];
        const analysisPages: any[] = [];
        let totalWordCount = 0;
        let successfulPagesCount = 0;

        for (const [index, result] of organicLinks.entries()) {
            if (!result.link) continue;

            try {
                console.log(`[Job ${job.id}] 🌐 Analyzing link ${index + 1}/${organicLinks.length}: ${result.link}`);

                // Fetch the HTML with a slight timeout to prevent hanging forever
                const response = await axios.get(result.link, { timeout: 10000 });
                const html = response.data;
                const $ = cheerio.load(html);

                // Extract Meta Title
                const metaTitle = $('title').text() || $('meta[property="og:title"]').attr('content') || '';

                // Extract Headings
                const h1 = $('h1').first().text().trim();

                const h2: string[] = [];
                if (limits.max_h2 > 0) {
                    $('h2').each((_, el) => {
                        const text = $(el).text().trim();
                        if (text && text.length > 5) h2.push(text);
                    });
                }

                const h3: string[] = [];
                if (limits.max_h3 > 0) {
                    $('h3').each((_, el) => {
                        const text = $(el).text().trim();
                        if (text && text.length > 5) h3.push(text);
                    });
                }

                const h4: string[] = [];
                if (limits.max_h4 > 0) {
                    $('h4').each((_, el) => {
                        const text = $(el).text().trim();
                        if (text && text.length > 5) h4.push(text);
                    });
                }

                const h5: string[] = [];
                if (limits.max_h5 > 0) {
                    $('h5').each((_, el) => {
                        const text = $(el).text().trim();
                        if (text && text.length > 5) h5.push(text);
                    });
                }

                const h6: string[] = [];
                if (limits.max_h6 > 0) {
                    $('h6').each((_, el) => {
                        const text = $(el).text().trim();
                        if (text && text.length > 5) h6.push(text);
                    });
                }

                // Calculate Word Count from Body Text
                // Strip out scripts, styles, navigation, and footers for a more accurate content word count
                $('script, style, nav, footer, header, noscript, svg, button').remove();
                const bodyText = $('body').text() || '';

                // Remove extra whitespace and count words
                const cleanText = bodyText.replace(/\s+/g, ' ').trim();
                const wordCount = cleanText ? cleanText.split(' ').length : 0;

                analysisPages.push({
                    link: result.link,
                    meta_title: metaTitle,
                    h1,
                    h2: h2.slice(0, limits.max_h2),
                    h3: h3.slice(0, limits.max_h3),
                    h4: h4.slice(0, limits.max_h4),
                    h5: h5.slice(0, limits.max_h5),
                    h6: h6.slice(0, limits.max_h6),
                    word_count: wordCount
                });

                totalWordCount += wordCount;
                successfulPagesCount++;

            } catch (err: any) {
                console.warn(`[Job ${job.id}] ⚠️ Failed to analyze ${result.link}: ${err.message}`);
                // Add a placeholder record for failed extractions so we maintain the link context
                analysisPages.push({
                    link: result.link,
                    meta_title: result.title || "Failed to parse",
                    h1: "",
                    h2: [],
                    h3: [],
                    h4: [],
                    h5: [],
                    h6: [],
                    word_count: 0,
                    error: true
                });
            }
        }

        const averageWordCount = successfulPagesCount > 0
            ? Math.round(totalWordCount / successfulPagesCount)
            : 0;

        console.log(`[Job ${job.id}] 📊 SERP Analysis Complete! Average Word Count: ${averageWordCount} across ${successfulPagesCount} successful parses.`);

        return {
            dataUpdate: {
                analysis: {
                    pages: analysisPages,
                    average_word_count: averageWordCount
                }
            }
        };
    }
}
