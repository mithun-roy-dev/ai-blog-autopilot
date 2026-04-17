import { SupabaseService } from './supabase.service';
import { Logger } from '../utils/logger';

export class SchedulerService {
    /**
     * Checks all site schedules and triggers jobs if due.
     */
    static async checkSchedules() {
        const supabase = SupabaseService.getClient();
        const now = new Date();

        try {
            // 1. Fetch all active schedules that are due
            const { data: pendingSchedules, error } = await supabase
                .from('blog_publishing_settings')
                .select('*')
                .eq('schedule_active', true)
                .lte('next_run_at', now.toISOString());

            if (error) throw error;
            if (!pendingSchedules || pendingSchedules.length === 0) return;

            console.log(`[Scheduler] ⏰ Found ${pendingSchedules.length} schedules due for processing.`);

            for (const schedule of pendingSchedules) {
                await this.processScheduleCatchUp(schedule);
            }

        } catch (error: any) {
            console.error('[Scheduler] ❌ Error in checkSchedules:', error.message);
        }
    }

    /**
     * Handles "Catch-up" logic: Triggers all missed jobs and updates next_run_at iteratively.
     */
    private static async processScheduleCatchUp(schedule: any) {
        const supabase = SupabaseService.getClient();
        const now = new Date();
        let currentNextRun = new Date(schedule.next_run_at);

        console.group(`[Scheduler] 🏗️ Processing Site ${schedule.blog_id}`);

        while (currentNextRun <= now) {
            console.log(`[Scheduler] 🚀 Triggering missed job for slot: ${currentNextRun.toISOString()}`);
            
            try {
                // 1. Find the next article to write
                const { data: page } = await supabase
                    .rpc('get_next_cluster_page_for_blog', { p_blog_id: schedule.blog_id })
                    .maybeSingle();

                if (!page) {
                    console.warn(`[Scheduler] ⚠️ No 'not_generated' pages found for Site ${schedule.blog_id}. Stopping catch-up.`);
                    // Even if no page, we transition to next run to avoid sticking here
                    currentNextRun = this.calculateNextRun(schedule, currentNextRun);
                    break; 
                }

                // 2. Create the Writing Job
                const { data: job, error: jobError } = await supabase
                    .from('writing_jobs')
                    .insert({
                        user_id: schedule.user_id,
                        blog_id: schedule.blog_id,
                        cluster_id: page.cluster_id,
                        title: page.title,
                        slug: page.slug,
                        primary_keyword: page.title, // Default to title as keyword for auto-pilot
                        status: 'queued',
                        generation_status: 'queued'
                    })
                    .select()
                    .single();

                if (jobError) throw jobError;

                // 3. Add to Job Queue
                await supabase.from('job_queue').insert({
                    user_id: schedule.user_id,
                    type: 'article_generation',
                    payload: { jobId: job.id },
                    status: 'queued'
                });

                // 4. Update Cluster Page status (to avoid double picking if scheduler runs again fast)
                await supabase
                    .from('cluster_pages')
                    .update({ status: 'generated' }) // Temporarily mark as generated/processing
                    .eq('id', page.id);

            } catch (err: any) {
                console.error(`[Scheduler] ❌ Failed to trigger job for site ${schedule.blog_id}:`, err.message);
                break; // Stop catch-up for this site if we hit errors
            }

            // 5. Increment to next slot
            const nextSlot = this.calculateNextRun(schedule, currentNextRun);
            
            // If the logic is "all_at_once", we trigger 'times_per_period' times in a row for THIS slot
            // but the loop will handle it if we adjust the slot correctly. 
            // Wait, for 'all_at_once', we should trigger N times then move +24h.
            if (schedule.schedule_logic === 'all_at_once') {
                for (let i = 1; i < schedule.times_per_period; i++) {
                     await this.triggerSingleJob(schedule, supabase);
                }
            }

            currentNextRun = nextSlot;
        }

        // 6. Persist the final next_run_at back to DB
        await supabase
            .from('blog_publishing_settings')
            .update({ next_run_at: currentNextRun.toISOString(), updated_at: new Date() })
            .eq('id', schedule.id);

        console.groupEnd();
    }

    private static async triggerSingleJob(schedule: any, supabase: any) {
        const { data: page } = await supabase
            .rpc('get_next_cluster_page_for_blog', { p_blog_id: schedule.blog_id })
            .maybeSingle();

        if (page) {
            const { data: job } = await supabase
                .from('writing_jobs')
                .insert({
                    user_id: schedule.user_id,
                    blog_id: schedule.blog_id,
                    cluster_id: page.cluster_id,
                    title: page.title,
                    slug: page.slug,
                    primary_keyword: page.title,
                    status: 'queued'
                })
                .select()
                .single();

            if (job) {
                await supabase.from('job_queue').insert({
                    user_id: schedule.user_id,
                    type: 'article_generation',
                    payload: { jobId: job.id },
                    status: 'queued'
                });
                await supabase.from('cluster_pages').update({ status: 'generated' }).eq('id', page.id);
            }
        }
    }

    /**
     * Calculates the next run time based on frequency and logic.
     */
    private static calculateNextRun(settings: any, lastRunAt: Date): Date {
        const { frequency, times_per_period, schedule_logic } = settings;
        let intervalMs = 0;

        if (frequency === 'daily') intervalMs = 24 * 60 * 60 * 1000;
        else if (frequency === 'weekly') intervalMs = 7 * 24 * 60 * 60 * 1000;
        else if (frequency === 'monthly') intervalMs = 30 * 24 * 60 * 60 * 1000;

        if (schedule_logic === 'spread_evenly') {
            // Spread N times over the period
            return new Date(lastRunAt.getTime() + (intervalMs / times_per_period));
        } else {
            // Run all N at once, then move to next period
            return new Date(lastRunAt.getTime() + intervalMs);
        }
    }
}
