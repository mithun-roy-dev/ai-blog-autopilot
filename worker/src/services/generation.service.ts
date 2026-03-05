import axios from 'axios';
import { SupabaseService } from './supabase.service';

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

            // Future steps will be implemented here...

            // Finalize overall job status
            await supabase
                .from('writing_jobs')
                .update({ status: 'completed', generation_status: 'completed', updated_at: new Date() })
                .eq('id', jobId);

            console.log(`[Job ${jobId}] ✅ Article generation completed!`);

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
}
