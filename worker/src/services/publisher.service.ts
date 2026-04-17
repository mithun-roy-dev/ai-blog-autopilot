import { SupabaseService } from './supabase.service';
import { WordPressService } from './wordpress.service';
import { Logger } from '../utils/logger';

export class PublisherService {
    /**
     * Publishes an article to its connected WordPress site.
     */
    static async publishArticle(jobId: string, payload: { article_id: string }) {
        const { article_id } = payload;
        const supabase = SupabaseService.getClient();
        const context = `Job:${jobId}`;

        try {
            Logger.info(context, `🚀 Starting publishing for article: ${article_id}`);
            await SupabaseService.updateJobStatus(jobId, 'processing');

            // 1. Fetch Article, Blog data, and Publishing Settings
            Logger.debug(context, "Fetching article and blog metadata...");
            const { data: article, error: articleError } = await supabase
                .from('articles')
                .select(`
                    *,
                    blogs (
                        url,
                        wp_api_key,
                        wp_username,
                        platform
                    )
                `)
                .eq('id', article_id)
                .single();

            if (articleError || !article) throw new Error(`Article not found: ${article_id}`);
            if (!article.blogs) throw new Error(`Blog data missing for article: ${article_id}`);

            const { data: settings } = await supabase
                .from('blog_publishing_settings')
                .select('*')
                .eq('blog_id', article.blog_id)
                .single();

            const blog = article.blogs;
            const wpUser = blog.wp_username;
            const wpKey = blog.wp_api_key;

            if (!wpUser || !wpKey) {
                Logger.error(context, `Missing credentials for blog: ${blog.url}`, { wpUser: !!wpUser, wpKey: !!wpKey });
                throw new Error(`WordPress credentials (username/API key) missing for blog: ${blog.url}`);
            }

            // 2. Prepare Post Data
            let wpStatus = settings?.publish_save_status || 'draft';
            Logger.debug(context, `Mapping publishing status: ${wpStatus}`);
            
            if (wpStatus === 'published') wpStatus = 'publish';
            if (wpStatus === 'scheduled') wpStatus = 'future';

            let postData: any = {
                title: article.title,
                content: article.content,
                status: wpStatus === 'future' ? 'publish' : wpStatus,
                slug: article.slug,
                excerpt: article.excerpt
            };

            if (wpStatus === 'future') {
                postData.status = 'future';
                const futureDate = new Date();
                futureDate.setMinutes(futureDate.getMinutes() + 5);
                postData.date = futureDate.toISOString();
                Logger.debug(context, "Scheduling for future date", { date: postData.date });
            }

            // 3. Push to WordPress
            Logger.info(context, `📡 Pushing to WordPress: ${blog.url} as ${wpStatus}`);
            const wpPost = await WordPressService.createPost(blog.url, postData, wpKey, wpUser);

            // 4. Update Article with live link
            Logger.debug(context, "Updating database with live link...", { link: wpPost.link });
            await supabase
                .from('articles')
                .update({
                    status: 'published',
                    source_url: wpPost.link,
                    updated_at: new Date()
                })
                .eq('id', article_id);

            await SupabaseService.updateJobStatus(jobId, 'completed');
            Logger.info(context, `✅ Published successfully! Live URL: ${wpPost.link}`);

        } catch (error: any) {
            Logger.error(context, `❌ Publishing failed for article ${article_id}`, error);
            
            // Record failure on the article itself
            await supabase
                .from('articles')
                .update({ status: 'failed_publish' })
                .eq('id', article_id);

            await SupabaseService.updateJobStatus(jobId, 'failed', error.message);
        }
    }
}
