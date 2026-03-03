import axios from 'axios';
import * as cheerio from 'cheerio';
import { SupabaseService } from './supabase.service';

export class IntelligenceService {
    private supabase = new SupabaseService();

    async processSiteIntelligence(blogId: string) {
        console.log(`[Intelligence] Starting deep crawl for blog: ${blogId}`);

        try {
            // 1. Fetch all synced articles/urls for this blog
            const { data: articles, error } = await SupabaseService.getClient()
                .from('articles')
                .select('id, source_url, title')
                .eq('blog_id', blogId);

            if (error) throw error;
            if (!articles || articles.length === 0) {
                console.log(`[Intelligence] No articles found for blog ${blogId}`);
                return;
            }

            console.log(`[Intelligence] Found ${articles.length} URLs to process`);

            // 2. Process each URL
            for (let i = 0; i < articles.length; i++) {
                const article = articles[i];
                try {
                    // Update progress
                    await this.updateProgress(blogId, {
                        status: 'processing',
                        current_url: article.source_url,
                        progress: i,
                        total: articles.length
                    });

                    await this.crawlAndExtract(blogId, article.id, article.source_url);
                } catch (err: any) {
                    console.error(`[Intelligence] Failed to process ${article.source_url}:`, err.message);
                }
            }

            // Final progress update
            await this.updateProgress(blogId, {
                status: 'completed',
                current_url: '',
                progress: articles.length,
                total: articles.length
            });

            console.log(`[Intelligence] Completed deep crawl for blog: ${blogId}`);
        } catch (err: any) {
            console.error(`[Intelligence] Error:`, err.message);
            throw err;
        }
    }

    private async crawlAndExtract(blogId: string, articleId: string, url: string) {
        console.log(`[Intelligence] Crawling: ${url}`);

        // Update status to processing
        await SupabaseService.getClient()
            .from('site_intelligence')
            .upsert({
                article_id: articleId,
                blog_id: blogId,
                status: 'processing',
                updated_at: new Date().toISOString()
            }, { onConflict: 'article_id' });

        try {
            const response = await axios.get(url, {
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });

            const $ = cheerio.load(response.data);

            // Extract data
            const title = $('title').text().trim() || $('meta[property="og:title"]').attr('content') || '';
            const metaDescription = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '';
            const h1 = $('h1').first().text().trim();

            const h2 = $('h2').map((_, el) => $(el).text().trim()).get().filter(t => t);
            const h3 = $('h3').map((_, el) => $(el).text().trim()).get().filter(t => t);
            const h4 = $('h4').map((_, el) => $(el).text().trim()).get().filter(t => t);
            const h5 = $('h5').map((_, el) => $(el).text().trim()).get().filter(t => t);
            const h6 = $('h6').map((_, el) => $(el).text().trim()).get().filter(t => t);

            // Word count (rough estimate from readable text)
            const textContent = $('body').text();
            const wordCount = textContent.split(/\s+/).filter(w => w.length > 0).length;

            // Categories/Tags (common patterns in WP and others)
            const categories = $('meta[property="article:section"]').attr('content') || '';
            const tags = $('meta[property="article:tag"]').map((_, el) => $(el).attr('content')).get().filter(t => t);

            // Internal links
            const internalLinks: any[] = [];
            const baseUrl = new URL(url).origin;
            $('a[href]').each((_, el) => {
                const href = $(el).attr('href');
                if (href && (href.startsWith('/') || href.startsWith(baseUrl))) {
                    internalLinks.push({
                        text: $(el).text().trim(),
                        href: href.startsWith('/') ? `${baseUrl}${href}` : href
                    });
                }
            });

            const schemaType = $('script[type="application/ld+json"]').map((_, el) => {
                try {
                    const json = JSON.parse($(el).html() || '{}');
                    return json['@type'] || (Array.isArray(json['@graph']) ? json['@graph'].map((i: any) => i['@type']) : null);
                } catch {
                    return null;
                }
            }).get().filter(t => t).join(', ');

            const canonical = $('link[rel="canonical"]').attr('href') || '';

            // 3. Save to database
            const { error } = await SupabaseService.getClient()
                .from('site_intelligence')
                .upsert({
                    blog_id: blogId,
                    article_id: articleId,
                    url: url,
                    title,
                    meta_description: metaDescription,
                    h1,
                    h2,
                    h3,
                    h4,
                    h5,
                    h6,
                    word_count: wordCount,
                    category: categories,
                    tags,
                    internal_links: internalLinks.slice(0, 50), // Limit for DB
                    schema_type: schemaType,
                    canonical,
                    status: 'completed',
                    last_crawled_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                }, { onConflict: 'article_id' });

            if (error) throw error;

        } catch (err: any) {
            console.error(`[Intelligence] Crawl failed for ${url}:`, err.message);
            await SupabaseService.getClient()
                .from('site_intelligence')
                .upsert({
                    article_id: articleId,
                    blog_id: blogId,
                    status: 'failed',
                    updated_at: new Date().toISOString()
                }, { onConflict: 'article_id' });
        }
    }

    private async updateProgress(blogId: string, info: any) {
        try {
            const { data: blog } = await SupabaseService.getClient()
                .from('blogs')
                .select('metadata')
                .eq('id', blogId)
                .single();

            const newMetadata = {
                ...(blog?.metadata || {}),
                intelligence: {
                    ...info,
                    last_updated: new Date().toISOString()
                }
            };

            await SupabaseService.getClient()
                .from('blogs')
                .update({ metadata: newMetadata })
                .eq('id', blogId);
        } catch (err: any) {
            console.error(`[Intelligence] Failed to update progress for ${blogId}:`, err.message);
        }
    }
}
