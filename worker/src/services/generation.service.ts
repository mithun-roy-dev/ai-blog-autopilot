import axios from 'axios';
import { SupabaseService } from './supabase.service';
import * as cheerio from 'cheerio';
import { PromptService } from './prompt.service';
import { LLMService, KieApiRetryableError } from './llm.service';
import { Logger } from '../utils/logger';
import { ImageService } from './image.service';

/** Retry config for transient Kie API 500 errors */
const MAX_KIE_RETRIES = 2;       // max re-attempts after first failure (4 total calls)
const KIE_RETRY_DELAY_MS = 20_000; // 20 seconds between retries

/** Simple async delay */
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

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

            // Fetch Site Writing Mode
            const { data: blog, error: blogError } = await supabase
                .from('blogs')
                .select('writing_mode, niche, custom_niche, metadata')
                .eq('id', job.blog_id)
                .single();

            const writingMode = blog?.writing_mode || 'Auto';
            const niche = blog?.niche === 'Others' ? blog.custom_niche : blog?.niche || 'General';
            console.log(`[Job ${jobId}] 🛠️ Mode: ${writingMode} | Niche: ${niche}`);

            const progress = await this.getProgress(jobId);

            // Step 1: SERP API Calling
            if (progress['serp_calling']?.status !== 'completed') {
                await this.executeStep(jobId, 'serp_calling', async () => {
                    return await this.step1SerpApi(job);
                });

                const currentMode = await this.getCurrentWritingMode(job.blog_id);
                if (currentMode === 'Manual') {
                    await this.pauseForApproval(jobId, 'serp_calling');
                    return;
                }
            }

            // Step 2: SERP Analyzer
            if (progress['serp_analyzing']?.status !== 'completed') {
                await this.executeStep(jobId, 'serp_analyzing', async () => {
                    const updatedJobData = await this.getGenerationData(jobId);
                    return await this.step2SerpAnalyzer(job, updatedJobData);
                });

                const currentMode = await this.getCurrentWritingMode(job.blog_id);
                if (currentMode === 'Manual') {
                    await this.pauseForApproval(jobId, 'serp_analyzing');
                    return;
                }
            }

            // Step 3: Content Brief
            if (progress['briefing']?.status !== 'completed') {
                await this.executeStep(jobId, 'briefing', async () => {
                    console.log(`[Job ${jobId}] 📝 Generating Dynamic Content Brief...`);

                    const generationData = await this.getGenerationData(jobId);
                    const promptConfig = await PromptService.getPrompt('content-brief');
                    if (!promptConfig) throw new Error("Prompt 'content-brief' not found.");

                    // 1. Fetch Cluster & Articles Logic
                    const { data: cluster } = await supabase.from('content_clusters').select('*').eq('id', job.cluster_id).single();
                    const { data: clusterPages } = await supabase.from('cluster_pages').select('*').eq('cluster_id', job.cluster_id);
                    const { data: liveArticles } = await supabase.from('articles')
                        .select('id, source_url, slug, status')
                        .eq('blog_id', job.blog_id)
                        .in('status', ['crawled', 'published']);

                    const currentPage = clusterPages?.find(p => p.slug === job.slug);
                    const pillarPage = clusterPages?.find(p => p.type === 'pillar');
                    const articleMap = new Map((liveArticles || []).map(a => [a.id, a]));

                    // 2. Internal Linking Logic
                    let linksMust = "Choose relevant links from linksChoice";
                    let linksChoice: string[] = [];

                    if (currentPage?.type === 'supporting') {
                        // linksMust: Cluster Pillar URL (if live)
                        if (pillarPage?.article_id) {
                            const pillarArticle = articleMap.get(pillarPage.article_id);
                            if (pillarArticle) linksMust = pillarArticle.source_url;
                        }

                        // linksChoice: Other live supporting articles in the same cluster
                        linksChoice = (clusterPages || [])
                            .filter(p => p.type === 'supporting' && p.id !== currentPage.id && p.article_id)
                            .map(p => articleMap.get(p.article_id!)?.source_url)
                            .filter(Boolean) as string[];
                    } else {
                        // If Pillar or unknown: All other live articles in the blog
                        linksChoice = (liveArticles || [])
                            .filter(a => a.slug !== job.slug)
                            .map(a => a.source_url)
                            .filter(Boolean);
                    }

                    // 3. Construct XML Blocks
                    const siteContextXml = `
<site_context>
  <site_description_short>${blog?.metadata?.description || 'General niche blog'}</site_description_short>
  <site_niche>${niche}</site_niche>
</site_context>`;

                    // 3. Word Count Resolution Logic
                    const targetWords = currentPage?.word_count_target || 1200;
                    const avgWords = generationData.analysis?.average_word_count || 0;
                    const threshold = avgWords * 1.5;

                    Logger.debug(`Job:${jobId}`, `WORD_COUNT_LOGIC: Target: ${targetWords}, Avg: ${avgWords}, Threshold: ${threshold}`);

                    let resolvedWordCount = targetWords;
                    if (targetWords < threshold) {
                        resolvedWordCount = Math.round(avgWords * 1.6);
                        Logger.debug(`Job:${jobId}`, `WORD_COUNT_OVERRIDE: New Target: ${resolvedWordCount}`);
                    }

                    // 4. Construct XML Blocks
                    const articleTargetXml = `
<article_target>
  <title>${job.title}</title>
  <keyword>${job.primary_keyword}</keyword>
  <category>${cluster?.topic || 'General'}</category>
  <intent>${cluster?.intent || 'Informational'}</intent>
  <words>${resolvedWordCount}</words>
  <images>2</images>
  <links_must>${linksMust}</links_must>
  <links_choice>
    ${linksChoice.map(url => `<url>${url}</url>`).join('\n    ')}
  </links_choice>
</article_target>`;

                    const serpDataXml = `
<serp_data>
${JSON.stringify(this.compressSerp(generationData), null, 2)}
</serp_data>`;

                    // 4. Final Prompt Construction
                    const systemPrompt = PromptService.injectVariables(promptConfig.system_prompt, { niche });
                    const userPromptMessage = `
${siteContextXml}
${articleTargetXml}
${serpDataXml}

${promptConfig.user_prompt_template}`;

                    // Log the full user message as requested
                    Logger.debug(`Job:${jobId}`, `CONTENT_BRIEF_PROMPT_USER:\n${userPromptMessage}`);

                    let brief: string;
                    try {
                        brief = await LLMService.completion({
                            system: systemPrompt,
                            user: userPromptMessage,
                            taskRef: 'content_brief',
                            json: false
                        });
                    } catch (error: any) {
                        Logger.error(`Job:${jobId}`, `❌ Content Brief Agent LLM call failed at LLMService.completion(): ${error.message}`);
                        Logger.debug(`Job:${jobId}`, `Content Brief Agent LLM call failed at LLMService.completion(): ${error.message}`);

                        if (error instanceof KieApiRetryableError) {
                            throw error;
                        }

                        throw new Error(`Content Brief Agent failed at LLMService.completion(): ${error.message}`);
                    }

                    // Log response for verification as requested
                    Logger.debug(`Job:${jobId}`, `CONTENT_BRIEF_RESPONSE:\n${brief}`);

                    return { dataUpdate: { brief } };
                });

                const currentMode = await this.getCurrentWritingMode(job.blog_id);
                if (currentMode === 'Manual') {
                    await this.pauseForApproval(jobId, 'briefing');
                    return;
                }
            }

            // Step 4: Writer Agent
            if (progress['writing']?.status !== 'completed') {
                await this.executeStep(jobId, 'writing', async () => {
                    console.log(`[Job ${jobId}] ✍️ Writing Full Article...`);

                    const generationData = await this.getGenerationData(jobId);
                    const promptConfig = await PromptService.getPrompt('writer-system-prompt');

                    if (!promptConfig) throw new Error("Prompt 'writer-system-prompt' not found.");

                    const systemPrompt = PromptService.injectVariables(promptConfig.system_prompt, { niche });

                    // Manual placeholder replacement for [content-brief] as requested
                    const briefText = typeof generationData.brief === 'string'
                        ? generationData.brief
                        : JSON.stringify(generationData.brief || {}, null, 2);

                    let userPrompt = promptConfig.user_prompt_template.replace('[content-brief]', briefText);

                    // Also support standard {{keyword}} etc. if present
                    userPrompt = PromptService.injectVariables(userPrompt, {
                        keyword: job.primary_keyword,
                        intent: generationData.serp?.intent || 'Informational',
                        niche: niche
                    });

                    // Logging prompts before calling OpenRouter as requested
                    Logger.debug(`Job:${jobId}`, `WRITER_AGENT_PROMPT_SYSTEM:\n${systemPrompt}`);
                    Logger.debug(`Job:${jobId}`, `WRITER_AGENT_PROMPT_USER:\n${userPrompt}`);

                    let articleContent: string;
                    try {
                        articleContent = await LLMService.completion({
                            system: systemPrompt,
                            user: userPrompt,
                            taskRef: 'writer'
                        });
                    } catch (error: any) {
                        Logger.error(`Job:${jobId}`, `❌ Writer Agent LLM call failed at LLMService.completion(): ${error.message}`);
                        Logger.debug(`Job:${jobId}`, `Writer Agent LLM call failed at LLMService.completion(): ${error.message}`);

                        if (error instanceof KieApiRetryableError) {
                            throw error;
                        }

                        throw new Error(`Writer Agent failed at LLMService.completion(): ${error.message}`);
                    }

                    // Logging response for verification as requested
                    Logger.debug(`Job:${jobId}`, `WRITER_AGENT_RESPONSE:\n${articleContent}`);

                    // Update the job with the generated content
                    await supabase
                        .from('writing_jobs')
                        .update({ content: articleContent, updated_at: new Date() })
                        .eq('id', jobId);

                    return { dataUpdate: { article_content: articleContent } };
                });

                const currentMode = await this.getCurrentWritingMode(job.blog_id);
                if (currentMode === 'Manual') {
                    await this.pauseForApproval(jobId, 'writing');
                    return;
                }
            }

            // Step 4.5: Image Agent
            if (progress['imaging']?.status !== 'completed') {
                await this.executeStep(jobId, 'imaging', async () => {
                    return await this.step45ImageAgent(job, jobId, supabase);
                });

                const currentMode = await this.getCurrentWritingMode(job.blog_id);
                if (currentMode === 'Manual') {
                    await this.pauseForApproval(jobId, 'imaging');
                    return;
                }
            }

            // Step 5: Humanizer Agent
            if (progress['humanizing']?.status !== 'completed') {
                await this.executeStep(jobId, 'humanizing', async () => {
                    return await this.step5HumanizerAgent(job, jobId, supabase);
                });

                const currentMode = await this.getCurrentWritingMode(job.blog_id);
                if (currentMode === 'Manual') {
                    await this.pauseForApproval(jobId, 'humanizing');
                    return;
                }
            }

            // Step 6: Editor Agent
            if (progress['editing']?.status !== 'completed') {
                Logger.info(`Job:${jobId}`, `✏️ Starting Editor Agent pass-through...`);
                await this.executeStep(jobId, 'editing', async () => {
                    console.log(`[Job ${jobId}] ✏️ Editor Agent: Running pass-through...`);
                    const generationData = await this.getGenerationData(jobId);
                    const contentToPass = generationData.humanized_content || '';
                    Logger.debug(`Job:${jobId}`, `EDITOR_AGENT: contentToPass = ${contentToPass}`);
                    return {
                        dataUpdate: {
                            edited_content: contentToPass
                        }
                    };
                });

                const autoEdit = await this.getAutoEditSetting();
                Logger.debug(`Job:${jobId}`, `EDITOR_AGENT: autoEdit setting = ${autoEdit}`);

                if (!autoEdit) {
                    await this.pauseForApproval(jobId, 'editing');
                    Logger.debug(`Job:${jobId}`, `EDITOR_AGENT: autoEdit setting = ${autoEdit} pauseForApproval()`);
                    return;
                }
            }

            // All steps done — mark the writing_job as completed
            await supabase
                .from('writing_jobs')
                .update({
                    status: 'completed',
                    generation_status: 'completed',
                    updated_at: new Date()
                })
                .eq('id', jobId);

            // 🚀 Promote to Article and Site Intelligence
            console.log(`[Job ${jobId}] 📦 Promoting job to public article and intelligence...`);
            const article = await SupabaseService.promoteJobToArticle(jobId);

            // 🤖 Auto-Publish Logic
            const { data: pubSettings } = await supabase
                .from('blog_publishing_settings')
                .select('auto_publish')
                .eq('blog_id', job.blog_id)
                .single();

            if (pubSettings?.auto_publish && article) {
                console.log(`[Job ${jobId}] 📡 Auto-publishing enabled. Queuing publish job...`);
                await supabase.from('job_queue').insert({
                    user_id: job.user_id,
                    type: 'publish_article',
                    payload: { article_id: article.id },
                    status: 'queued'
                });

                // Update article status to track it's in progress
                await supabase.from('articles').update({ status: 'scheduled' }).eq('id', article.id);
            }

            Logger.info(`Job:${jobId}`, `🎉 All steps completed successfully!`);

        } catch (error: any) {
            Logger.error(`Job:${jobId}`, `❌ Generation pipeline failed at processGeneration: ${error.message}`, error);
            const supabase = SupabaseService.getClient();
            const { error: dbError } = await supabase
                .from('writing_jobs')
                .update({
                    status: 'failed',
                    generation_status: 'failed',
                    updated_at: new Date()
                })
                .eq('id', jobId);

            if (dbError) {
                Logger.error(`Job:${jobId}`, `❌ Failed to update writing_jobs to failed state in processGeneration`, dbError);
            }

            throw error;
        }
    }

    private static async executeStep(jobId: string, stepId: string, stepFn: () => Promise<any>) {
        const supabase = SupabaseService.getClient();
        const startedAt = new Date().toISOString();

        console.log(`[Job ${jobId}] 🔄 Executing step: ${stepId}...`);
        Logger.info(`Job:${jobId}`, `STEP_START: ${stepId}`);

        // Get current state once to avoid multiple DB calls
        const initialProgress = await this.getProgress(jobId);

        // Update status to current step
        const { error: startUpdateError } = await supabase
            .from('writing_jobs')
            .update({
                generation_status: stepId,
                generation_progress: {
                    ...initialProgress,
                    [stepId]: { status: 'processing', started_at: startedAt }
                },
                updated_at: new Date()
            })
            .eq('id', jobId);

        if (startUpdateError) {
            Logger.error(`Job:${jobId}`, `❌ Failed to update job to processing for ${stepId}: ${startUpdateError.message}`);
            throw startUpdateError;
        }

        try {
            // --- Retry loop for transient Kie API 500 errors ---
            let lastError: any = null;
            let result: any = null;

            Logger.debug(`Job:${jobId}`, `STEP_EXECUTE: Calling stepFn for ${stepId}`);
            for (let attempt = 1; attempt <= MAX_KIE_RETRIES + 1; attempt++) {
                try {
                    result = await stepFn();
                    lastError = null;
                    break; // success — exit retry loop
                } catch (err: any) {
                    lastError = err;

                    const isRetryable = err instanceof KieApiRetryableError;
                    const hasRetriesLeft = attempt <= MAX_KIE_RETRIES;

                    if (isRetryable && hasRetriesLeft) {
                        const retryAt = new Date(Date.now() + KIE_RETRY_DELAY_MS).toISOString();
                        const retryMsg = `Kie API temporarily unavailable. Auto-retrying in 20s... (attempt ${attempt}/${MAX_KIE_RETRIES})`;

                        Logger.warn(`Job:${jobId}`, `⚠️ ${stepId}: KieApiRetryableError on attempt ${attempt}/${MAX_KIE_RETRIES}. Waiting ${KIE_RETRY_DELAY_MS / 1000}s before retry. Error: ${err.message}`);

                        const currentRetryingProgress = await this.getProgress(jobId);
                        await supabase
                            .from('writing_jobs')
                            .update({
                                generation_progress: {
                                    ...currentRetryingProgress,
                                    [stepId]: {
                                        status: 'retrying',
                                        attempt,
                                        max_attempts: MAX_KIE_RETRIES,
                                        message: retryMsg,
                                        retry_at: retryAt,
                                        started_at: startedAt
                                    }
                                },
                                updated_at: new Date()
                            })
                            .eq('id', jobId);

                        await sleep(KIE_RETRY_DELAY_MS);

                        const postRetryProgress = await this.getProgress(jobId);
                        await supabase
                            .from('writing_jobs')
                            .update({
                                generation_progress: {
                                    ...postRetryProgress,
                                    [stepId]: { status: 'processing', started_at: startedAt, retry_attempt: attempt + 1 }
                                },
                                updated_at: new Date()
                            })
                            .eq('id', jobId);

                        continue; // next attempt
                    }

                    // Non-retryable error OR retries exhausted — exit loop and let catch below handle it
                    if (isRetryable && !hasRetriesLeft) {
                        Logger.error(`Job:${jobId}`, `❌ ${stepId}: All ${MAX_KIE_RETRIES} Kie API retries exhausted. Failing step.`, err);
                        lastError = new Error(`Kie API failed after ${MAX_KIE_RETRIES} retries: ${err.message}`);
                    }
                    break;
                }
            }

            if (lastError) throw lastError;

            Logger.debug(`Job:${jobId}`, `STEP_EXECUTE: stepFn finished for ${stepId}`);
            const finishedAt = new Date().toISOString();

            // Fetch current state again to ensure we don't overwrite other parallel updates (though pipeline is linear)
            const latestProgress = await this.getProgress(jobId);
            const latestData = await this.getGenerationData(jobId);

            Logger.info(`Job:${jobId}`, `STEP_UPDATE: Saving results for ${stepId}...`);
            // Update with results
            const { error: finalUpdateError } = await supabase
                .from('writing_jobs')
                .update({
                    generation_data: {
                        ...latestData,
                        ...result.dataUpdate
                    },
                    generation_progress: {
                        ...latestProgress,
                        [stepId]: { status: 'completed', started_at: startedAt, finished_at: finishedAt }
                    },
                    updated_at: new Date()
                })
                .eq('id', jobId);

            if (finalUpdateError) {
                Logger.error(`Job:${jobId}`, `❌ Failed to update job completion for ${stepId}: ${finalUpdateError.message}`);
                throw finalUpdateError;
            }

            Logger.info(`Job:${jobId}`, `STEP_FINISH: ${stepId} completed successfully.`);
            return result;
        } catch (error: any) {
            // Step failure
            Logger.error(`Job:${jobId}`, `❌ Step ${stepId} failed: ${error.message}`);

            // Try to record the failure in the progress object
            try {
                const errorProgress = await this.getProgress(jobId);
                await supabase
                    .from('writing_jobs')
                    .update({
                        generation_progress: {
                            ...errorProgress,
                            [stepId]: { status: 'failed', error: error.message, started_at: startedAt, failed_at: new Date().toISOString() }
                        },
                        updated_at: new Date()
                    })
                    .eq('id', jobId);
            } catch (innerDbError: any) {
                Logger.error(`Job:${jobId}`, `❌ Critical failure: Could not even record step failure for ${stepId} in DB: ${innerDbError.message}`);
            }

            throw error;
        }
    }

    private static async pauseForApproval(jobId: string, currentStep: string) {
        const supabase = SupabaseService.getClient();
        console.log(`[Job ${jobId}] ⏸️ Pausing after ${currentStep} for manual review.`);

        await supabase
            .from('writing_jobs')
            .update({
                status: 'awaiting_approval',
                updated_at: new Date()
            })
            .eq('id', jobId);
    }

    private static async getProgress(jobId: string) {
        const supabase = SupabaseService.getClient();
        const { data } = await supabase.from('writing_jobs').select('generation_progress').eq('id', jobId).single();
        return data?.generation_progress || {};
    }

    private static async getCurrentWritingMode(blogId: string): Promise<string> {
        const supabase = SupabaseService.getClient();
        const { data } = await supabase
            .from('blogs')
            .select('writing_mode')
            .eq('id', blogId)
            .single();
        return data?.writing_mode || 'Auto';
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

    /**
     * Step 4.5: Image Agent — extract placeholders, generate images, upload to R2, replace in content
     */
    private static async step45ImageAgent(job: any, jobId: string, supabase: any) {
        console.log(`[Job ${jobId}] 🖼️ Image Agent: Starting image generation pipeline...`);

        // 1. Fetch current article content
        const { data: jobData } = await supabase
            .from('writing_jobs')
            .select('content, blog_id, user_id, blogs(name)')
            .eq('id', jobId)
            .single();

        const articleContent: string = jobData?.content || '';
        const siteName: string = jobData?.blogs?.name || 'Unknown Site';
        const userId: string = jobData?.user_id;
        const blogId: string = jobData?.blog_id;

        // 2. Extract image placeholders
        const imageBlocks = ImageService.extractImagePlaceholders(articleContent);
        Logger.debug(`Job:${jobId}`, `IMAGE_AGENT: Found ${imageBlocks.length} image placeholder(s)`);

        if (imageBlocks.length === 0) {
            console.log(`[Job ${jobId}] 🖼️ Image Agent: No [IMAGE] placeholders found — skipping`);
            return { dataUpdate: { images_count: 0 } };
        }

        // 3. Determine which image provider to use (super admin vs global)
        const SUPER_ADMIN_EMAIL = 'mithunroyabir@gmail.com';
        const { data: profile } = await supabase
            .from('profiles')
            .select('email')
            .eq('id', userId)
            .single();

        const isSuperAdmin = profile?.email === SUPER_ADMIN_EMAIL;

        const { data: sysConfig } = await supabase
            .from('system_settings')
            .select('value')
            .eq('key', 'logging_config')
            .single();

        const configValue = sysConfig?.value as any;
        Logger.debug(`Job:${jobId}`, `IMAGE_AGENT: configValue keys=${Object.keys(configValue || {}).join(', ')}`);
        Logger.debug(`Job:${jobId}`, `IMAGE_AGENT: Profile email="${profile?.email}" isSuperAdmin=${isSuperAdmin}`);


        // 4. Resolve image metadata model and API key dynamically from System Setup
        const metadataResolved = await LLMService.resolveTask('image_metadata');
        const metadataModel = metadataResolved.model;
        const metadataApiKey = metadataResolved.apiKey;
        const metadataProvider = metadataResolved.provider;
        Logger.debug(`Job:${jobId}`, `IMAGE_AGENT: metadataModel="${metadataModel}" → resolved metadataProvider="${metadataProvider}"`);
        // 5. Fetch Cloudflare R2 config
        const { data: r2Data } = await supabase
            .from('ai_configurations')
            .select('api_key')
            .eq('provider', 'cloudflare_r2')
            .single();

        if (!r2Data?.api_key) throw new Error('Cloudflare R2 not configured. Add credentials in Site Setup.');
        const r2Config = ImageService.parseR2Config(r2Data.api_key);

        // 6. Process each image block
        let updatedContent = articleContent;
        let successCount = 0;
        const imageUrls: Array<{ number: number; type: string; url: string; alt: string; caption: string }> = [];

        for (const block of imageBlocks) {
            try {
                console.log(`[Job ${jobId}] 🖼️ Processing image #${block.number} (${block.type})...`);

                // Step A: Generate image metadata/prompt via LLM
                const metadataContent = await ImageService.generateImageMetadata(
                    block,
                    metadataModel,
                    metadataApiKey,
                    jobId,
                    metadataProvider
                );

                // Step B: Generate the actual image
                const imageProvider = block.type === 'featured'
                    ? configValue?.feature_image_provider
                    : configValue?.inbody_image_provider;

                const imageResult = await ImageService.generateImage(
                    metadataContent,
                    block.type,
                    imageProvider || 'openrouter',
                    siteName,
                    jobId,
                    configValue || {}
                );

                // Step C: Upload to Cloudflare R2 with isolated hierarchical path
                // Path: users/{userId}/blogs/{blogId}/jobs/{jobId}/img-{type}-{number}-{timestamp}.[ext]
                // This ensures each user's images are stored in their own namespace
                // and URLs are unguessable since all IDs are UUIDs.
                const timestamp = Date.now();
                const imageType = block.type === 'featured' ? 'featured' : 'inbody';
                const r2Key = `users/${userId}/blogs/${blogId}/jobs/${jobId}/img-${imageType}-${block.number}-${timestamp}.${imageResult.extension}`;
                const publicUrl = await ImageService.uploadToR2(imageResult.buffer, r2Key, r2Config, jobId);

                Logger.debug(`Job:${jobId}`, `IMAGE_AGENT: R2 path = ${r2Key}`);

                // Step D: Replace the [IMAGE ... ] block with <figure> HTML
                const figureHtml = ImageService.formatImageHtml(block, publicUrl);
                updatedContent = updatedContent.replace(block.rawBlock, figureHtml);

                // Track success
                successCount++;
                imageUrls.push({
                    number: block.number,
                    type: block.type,
                    url: publicUrl,
                    alt: block.alt,
                    caption: block.caption,
                });

                console.log(`[Job ${jobId}] ✅ Image #${block.number} generated and uploaded: ${publicUrl}`);
            } catch (imgError: any) {
                Logger.debug(`Job:${jobId}`, `IMAGE_AGENT_ERROR [#${block.number}]: ${imgError.message}`);
                console.error(`[Job ${jobId}] ⚠️ Failed to generate image #${block.number}: ${imgError.message}`);

                if (imgError instanceof KieApiRetryableError) {
                    throw imgError; // Let executeStep handle retries
                }

                // If this is a structural API failure from ANY provider (Kie API, OpenRouter, Google),
                // we crash the entire job instead of publishing an article with a broken image slot.
                const errMsg = imgError.message || '';
                if (
                    errMsg.includes('Kie API Error') ||
                    errMsg.includes('permanently') ||
                    errMsg.includes('internal code') ||
                    errMsg.includes('Google AI') ||
                    errMsg.includes('OpenRouter')
                ) {
                    throw new Error(`Image Agent API failure: ${errMsg}`);
                }

                // Otherwise, for minor format errors (like sharp resizing issues), log and continue
            }
        }

        // 7. Save the updated article content back to writing_jobs.content (used by later steps)
        await supabase
            .from('writing_jobs')
            .update({ content: updatedContent, updated_at: new Date() })
            .eq('id', jobId);

        Logger.debug(`Job:${jobId}`, `IMAGE_AGENT: Completed. ${successCount}/${imageBlocks.length} image(s) generated.`);

        // 8. Return imaging result — stored in generation_data.imaging for the frontend panel
        //    article_with_images = full article HTML (markdown + <figure> HTML mixed)
        //    image_urls          = list of generated R2 URLs with metadata
        return {
            dataUpdate: {
                imaging: {
                    images_count: imageBlocks.length,
                    images_generated: successCount,
                    image_urls: imageUrls,
                    article_with_images: updatedContent,
                }
            }
        };
    }

    static async createSingleImage(jobId: string, imageHtml: string) {
        const supabase = SupabaseService.getClient();
        console.log(`[Job ${jobId}] 🖼️ Image Agent: Regenerating single image...`);
        Logger.debug(`Job:${jobId}`, `createSingleImage: Starting...imageHtml = ${imageHtml}`);
        // 1. Fetch current job data to get blog mapping
        const { data: jobData, error: jobError } = await supabase
            .from('writing_jobs')
            .select('blog_id, user_id, blogs(name)')
            .eq('id', jobId)
            .single();

        if (jobError || !jobData) {
            Logger.debug(`Job:${jobId}`, `createSingleImage: Job not found or missing relations: ${jobError?.message}`);
            throw new Error(`Job not found or missing relations: ${jobError?.message}`);
        }

        const siteName: string = (jobData as any)?.blogs?.name || 'Unknown Site';
        const userId: string = jobData.user_id;
        const blogId: string = jobData.blog_id;
        Logger.debug(`Job:${jobId}`, `createSingleImage: siteName = ${siteName}, userId = ${userId}, blogId = ${blogId} ,\n\n imageHtml = ${imageHtml}`);
        // 2. Parse the HTML using Cheerio
        const $ = cheerio.load(imageHtml);
        const $img = $('img');
        const $figcaption = $('figcaption');

        const altText = $img.attr('alt') || '';
        const titleText = $img.attr('title') || '';
        const imgClass = $img.attr('class') || '';
        const captionText = $figcaption.text() || '';
        const oldSrc = $img.attr('src') || '';

        const type = imgClass.includes('featured') ? 'featured' : 'in-body'; // my img class will like class="in-body transition-opacity duration-300"

        // Extract number from old src (e.g., img-inbody-2-12345.webp -> 2)
        let imgNumber = Math.floor(Math.random() * 1000);
        const match = oldSrc.match(/-(\d+)-\d+\./);
        if (match) imgNumber = parseInt(match[1]);

        // Build mock ImageBlock required by ImageService
        const block: any = {
            rawBlock: imageHtml,
            number: imgNumber,
            type: type,
            title: titleText,
            alt: altText,
            caption: captionText,
            description: `Title: ${titleText}. Context: ${captionText}`,
        };
        Logger.debug(`Job:${jobId}`, `createSingleImage: block = ${JSON.stringify(block)}`);
        // 3. Resolve metadata model config
        const metadataResolved = await LLMService.resolveTask('image_metadata');
        const metadataModel = metadataResolved.model;
        const metadataApiKey = metadataResolved.apiKey;
        const metadataProvider = metadataResolved.provider;

        // 4. Resolve Image Gen config and R2 Config from DB
        const { data: sysConfig } = await supabase.from('system_settings').select('value').eq('key', 'logging_config').single();
        const configValue = sysConfig?.value as any;

        const { data: r2Data } = await supabase.from('ai_configurations').select('api_key').eq('provider', 'cloudflare_r2').single();
        if (!r2Data?.api_key) throw new Error('Cloudflare R2 not configured in Site Setup.');
        const r2Config = ImageService.parseR2Config(r2Data.api_key);

        // 5. Generate Metadata
        console.log(`[Job ${jobId}] 🧠 Generating image prompt/metadata...`);
        const metadataContent = await ImageService.generateImageMetadata(
            block,
            metadataModel,
            metadataApiKey,
            jobId,
            metadataProvider
        );

        // 6. Generate Image
        console.log(`[Job ${jobId}] 🎨 Generating image via provider...`);
        Logger.debug(`Job:${jobId}`, `IMAGE_AGENT: Generating image via provider...metadataContent=${metadataContent}, block=${JSON.stringify(block)}`);
        const imageProvider = block.type.includes('featured') ? configValue?.feature_image_provider : configValue?.inbody_image_provider;

        const imageResult = await ImageService.generateImage(
            metadataContent,
            block.type,
            imageProvider || 'openrouter',
            siteName,
            jobId,
            configValue || {}
        );

        // 7. Upload to R2
        console.log(`[Job ${jobId}] ☁️ Uploading to R2...`);
        const timestamp = Date.now();
        const imageType = block.type.includes('featured') ? 'featured' : 'inbody';
        const r2Key = `users/${userId}/blogs/${blogId}/jobs/${jobId}/img-${imageType}-${block.number}-${timestamp}.${imageResult.extension}`;

        const publicUrl = await ImageService.uploadToR2(imageResult.buffer, r2Key, r2Config, jobId);
        if (!publicUrl) {
            console.error(`[Job ${jobId}] ❌ Image create via api. But Failed to upload image to R2`);
            Logger.debug(`Job:${jobId}`, ` Image create via api. But Failed to upload image to R2`);
            throw new Error('Failed to upload image to R2');
        }
        Logger.debug(`Job:${jobId}`, `SINGLE_IMAGE_REGEN: success, new URL: ${publicUrl}`);

        return publicUrl;
    }

    /**
     * Extracts the ```post-info ... ``` fenced block from an article string.
     * Returns the block text and the article without the block.
     */
    private static extractPostInfoBlock(article: string): { postInfoBlock: string; articleWithout: string } {
        // Match the full ```post-info ... ``` block (including the fences)
        const postInfoRegex = /```post-info\r?\n[\s\S]*?```/;
        const match = article.match(postInfoRegex);
        if (!match) {
            return { postInfoBlock: '', articleWithout: article };
        }
        const postInfoBlock = match[0];
        // Remove the block (and any trailing blank line left behind)
        const articleWithout = article.replace(postInfoRegex, '').replace(/^\s*\n/, '');
        return { postInfoBlock, articleWithout };
    }

    /**
     * Re-inserts a post-info block immediately after the first H1 line in an article.
     */
    private static reinsertPostInfoBlock(article: string, postInfoBlock: string): string {
        if (!postInfoBlock) return article;
        const lines = article.split('\n');
        const h1Index = lines.findIndex(l => /^#\s/.test(l.trim()));
        if (h1Index === -1) {
            // No H1 found — prepend the block at the top
            return postInfoBlock + '\n\n' + article;
        }
        lines.splice(h1Index + 1, 0, '', postInfoBlock, '');
        return lines.join('\n');
    }

    /**
     * Step 5: Humanizer Agent — takes the post-image article and humanizes it using the
     * "humanizer-prompt" prompt config. Replaces {{ARTICLE}} with article content.
     *
     * Token optimization: strips the ```post-info``` block before sending to the LLM
     * (it's pure SEO metadata, not prose — no need to pay tokens for it).
     * After the LLM responds, the block is re-inserted after the first H1, exactly as before.
     */
    private static async step5HumanizerAgent(job: any, jobId: string, supabase: any) {
        console.log(`[Job ${jobId}] 🤖→🧑 Humanizer Agent: Starting humanization...`);

        // 1. Fetch the frozen output of the Image Agent step from generation_data.
        //    Using imaging.article_with_images (immutable snapshot) is safer than reading
        //    writing_jobs.content, which is mutable and would cause double-humanization on retries.
        const generationData = await GenerationService.getGenerationData(jobId);
        const articleContent: string =
            generationData?.imaging?.article_with_images   // ✅ preferred: explicit post-image output
            || generationData?.article_content             // fallback: raw writer output (if imaging was skipped)
            || '';

        if (!articleContent || articleContent.trim().length === 0) {
            Logger.debug(`Job:${jobId}`, `HUMANIZER_AGENT: No article content found — skipping`);
            console.log(`[Job ${jobId}] 🤖→🧑 Humanizer Agent: No content to humanize — skipping`);
            return { dataUpdate: { humanized_content: '' } };
        }

        // 2. Strip the post-info block to save tokens — we'll re-inject it after humanizing
        const { postInfoBlock, articleWithout } = GenerationService.extractPostInfoBlock(articleContent);
        if (postInfoBlock) {
            console.log(`[Job ${jobId}] 🤖→🧑 Humanizer Agent: Stripped post-info block (${postInfoBlock.length} chars saved)`);
        }

        // 3. Fetch humanizer-prompt from ai_prompts
        const promptConfig = await PromptService.getPrompt('humanizer-prompt');
        if (!promptConfig) {
            throw new Error("Prompt 'humanizer-prompt' not found in ai_prompts. Please create it in Admin > Site Setup > Prompt Setup.");
        }

        Logger.debug(`Job:${jobId}`, `HUMANIZER_AGENT: Loaded prompt slug="humanizer-prompt"`);

        // 4. Build prompts — inject the article WITHOUT the post-info block
        const systemPrompt = promptConfig.system_prompt || '';
        const userPrompt = PromptService.injectVariables(
            promptConfig.user_prompt_template,
            { ARTICLE: articleWithout }
        );

        Logger.debug(`Job:${jobId}`, `HUMANIZER_AGENT_PROMPT_SYSTEM:\n${systemPrompt}`);
        Logger.debug(`Job:${jobId}`, `HUMANIZER_AGENT_PROMPT_USER (first 500 chars):\n${userPrompt.substring(0, 500)}`);

        // 5. Call LLM — provider/model resolved dynamically from system_settings
        let humanizedRaw: string;
        try {
            humanizedRaw = await LLMService.completion({
                system: systemPrompt,
                user: userPrompt,
                taskRef: 'humanizer',
                json: false
            });
        } catch (error: any) {
            Logger.error(`Job:${jobId}`, `❌ Humanizer Agent LLM call failed at LLMService.completion(): ${error.message}`);
            Logger.debug(`Job:${jobId}`, `Humanizer Agent LLM call failed at LLMService.completion(): ${error.message}`);

            if (error instanceof KieApiRetryableError) {
                throw error;
            }

            // Throwing a standard Error ensures executeStep doesn't retry (even if it's KieApiRetryableError),
            // and processGeneration marks the entire job as failed.
            throw new Error(`Humanizer Agent failed at LLMService.completion(): ${error.message}`);
        }

        Logger.debug(`Job:${jobId}`, `HUMANIZER_AGENT_RESPONSE (first 500 chars):\n${humanizedRaw.substring(0, 500)}`);

        // 6. Re-insert the post-info block after the H1 in the humanized output
        const humanizedContent = GenerationService.reinsertPostInfoBlock(humanizedRaw, postInfoBlock);

        console.log(`[Job ${jobId}] ✅ Humanizer Agent: Completed (${humanizedContent.length} chars, post-info re-injected: ${!!postInfoBlock})`);

        // 7. Save humanized content as the main article content (for Editor to use)
        await supabase
            .from('writing_jobs')
            .update({ content: humanizedContent, updated_at: new Date() })
            .eq('id', jobId);

        return {
            dataUpdate: {
                humanized_content: humanizedContent
            }
        };
    }

    private static async getAutoEditSetting(): Promise<boolean> {
        const supabase = SupabaseService.getClient();
        const { data } = await supabase
            .from('system_settings')
            .select('value')
            .eq('key', 'logging_config')
            .single();
        return data?.value?.auto_edit ?? false;
    }

    private static compressSerp(generationData: any): any {
        const raw = generationData.serp || {};
        const analysis = generationData.analysis || {};

        return {
            avg_words: analysis.average_word_count || 0,
            organic: (raw.organic_results || []).slice(0, 8).map((r: any) => ({
                t: r.title,
                s: (r.snippet || "").substring(0, 100)
            })),
            searches: (raw.related_searches || []).map((r: any) => r.query),
            questions: (raw.related_questions || []).map((r: any) => r.question),
            pages: (analysis.pages || []).slice(0, 20).map((p: any) => ({
                h1: p.h1 || "",
                h2: p.h2 || [],
                h3: p.h3 || []
            }))
        };
    }
}
