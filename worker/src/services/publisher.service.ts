import { SupabaseService } from './supabase.service';
import { WordPressService } from './wordpress.service';
import { Logger } from '../utils/logger';
import * as cheerio from 'cheerio';
import axios from 'axios';
import { marked } from 'marked';

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
                        platform,
                        id
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

            // 2. Extract Metadata and Content from Editor Output
            Logger.debug(context, "Parsing editorial output (post-info and content blocks)...");
            // Use article.content which contains the editor's output
            const { meta, htmlPostBodyContent } = this.extractEditorialData(article.content);
            Logger.debug(context, "Meta data:\n" + meta + "\n");
            Logger.debug(context, "HTML content prepared for body.");

            // 3. Handle Featured Image
            let featuredMediaId: number | undefined;
            const featuredImgData = this.extractFeaturedImage(htmlPostBodyContent);
            Logger.debug(context, "Featured image data extracted from HTML.", { hasData: !!featuredImgData });

            if (featuredImgData) {
                // 3.1 Fetch original job data to get the detailed [IMAGE] description
                let featureImgDescription = "";
                try {
                    const originalJobId = article.internal_url?.split('/').pop();
                    if (originalJobId) {
                        Logger.debug(context, `Fetching original job ${originalJobId} for image metadata...`);
                        const { data: jobData } = await supabase
                            .from('writing_jobs')
                            .select('generation_data')
                            .eq('id', originalJobId)
                            .single();

                        if (jobData?.generation_data?.article_content) {
                            featureImgDescription = this.extractImageDescriptionFromJob(jobData.generation_data.article_content);
                            Logger.debug(context, "Extracted detailed image description from job data.");
                        }
                    }
                } catch (jobErr: any) {
                    Logger.debug(context, `Could not fetch original job description: ${jobErr.message}`);
                }

                Logger.debug(context, "Featured image detected. Processing SEO renaming and upload...", featuredImgData);

                // SEO Friendly filename: [title from img tag]-[imageType].[ext]
                // and extract imageType from writer agent output if possible, else fallback to 'featured'
                // We use featuredImgData.title for the SEO name
                const safeImageTitle = featuredImgData.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                const ext = featuredImgData.src.split('.').pop()?.split('?')[0] || 'webp';
                const seoFileName = `${safeImageTitle}-featured.${ext}`;

                Logger.debug(context, `Generated SEO filename: ${seoFileName}`);

                try {

                    const imgResponse = await axios.get(featuredImgData.src, { responseType: 'arraybuffer' });
                    const imgBuffer = Buffer.from(imgResponse.data);
                    const mimeType = String(imgResponse.headers["content-type"] || "image/webp");

                    featuredMediaId = await WordPressService.uploadMedia(
                        blog.url,
                        imgBuffer,
                        mimeType,
                        seoFileName,
                        {
                            alt: featuredImgData.alt,
                            caption: featuredImgData.figcaption,
                            title: featuredImgData.title,
                            description: featureImgDescription
                        },
                        wpKey,
                        wpUser
                    );
                    Logger.debug(context, `Uploaded featured image. WP Media ID: ${featuredMediaId}`);
                } catch (imgErr: any) {
                    Logger.error(context, `⚠️ Featured image upload failed: ${imgErr.message}. Proceeding without it.`);
                }
            }

            // 4. Resolve Taxonomies (Category and Tags)
            Logger.debug(context, "Resolving category and tags with fallbacks...");
            // Get cluster topic from db if available
            const { data: cluster } = await (supabase
                .from('content_clusters')
                .select('topic, strategy_summary')
                .eq('id', article.cluster_id)
                .limit(1)
                .single() as any);

            Logger.debug(context, "Cluster data:", cluster);
            const categoryName = cluster?.topic || 'Uncategorized';
            const categoryDescription = cluster?.strategy_summary || 'Category created by AI Blog Autopilot';

            let categoryId = await WordPressService.getOrCreateCategoryByName(blog.url, categoryName, categoryDescription, wpKey, wpUser);
            Logger.debug(context, "Category ID:" + categoryId + "\n");

            const tagNames = (meta.secondaryKeywords || '').split(',').map((s: string) => s.trim()).filter(Boolean);
            const tagIds = await WordPressService.getTagIdsByNames(blog.url, tagNames, wpKey, wpUser);

            // Clean HTML (Remove H1 and Featured Img) BEFORE Gutenberg wrapping
            const cleanHtml = this.removeH1FeatureImg(htmlPostBodyContent);
            const htmlPostContentGutenberg = this.wrapInGutenbergBlocks(cleanHtml);

            // 5. Build WordPress Payload
            let wpStatus = settings?.publish_save_status || 'draft';
            if (wpStatus === 'published') wpStatus = 'publish';
            if (wpStatus === 'scheduled') wpStatus = 'future';

            let postData: any = {
                title: article.title || meta.h1Title,
                content: htmlPostContentGutenberg,
                status: wpStatus === 'future' ? 'publish' : wpStatus,
                slug: article.slug || meta.slug?.replace(/^\//, ''),
                categories: [categoryId],
                tags: tagIds,
            };

            if (featuredMediaId) postData.featured_media = featuredMediaId;

            if (wpStatus === 'future') {
                postData.status = 'future';
                const futureDate = new Date();
                futureDate.setMinutes(futureDate.getMinutes() + 5);
                postData.date = futureDate.toISOString();
            }

            // Add RankMath SEO Meta
            if (settings?.enable_rankmath_metadata) {
                postData.meta = {
                    rank_math_title: meta.metaTitle,
                    rank_math_description: meta.metaDesc,
                    rank_math_focus_keyword: meta.primaryKeyword
                };
            }

            // 6. Push to WordPress
            Logger.info(context, `📡 Pushing to WordPress: ${blog.url} as ${wpStatus}`);
            const wpPost = await WordPressService.createPost(blog.url, postData, wpKey, wpUser);

            // 7. Update Article with live link
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

            await supabase
                .from('articles')
                .update({ status: 'failed_publish' })
                .eq('id', article_id);

            await SupabaseService.updateJobStatus(jobId, 'failed', error.message);
        }
    }

    /**
     * Extracts SE0 and Content Metadata from raw editorial content.
     */
    private static extractEditorialData(content: string) {
        const postInfoRegex = /```post-info\r?\n([\s\S]*?)```/;
        const match = content.match(postInfoRegex);

        let meta: any = {};
        let rawMarkdown = content;

        if (match) {
            const blockContent = match[1];
            const lines = blockContent.split('\n');
            lines.forEach(line => {
                const colonIdx = line.indexOf(':');
                if (colonIdx !== -1) {
                    const key = line.substring(0, colonIdx).trim();
                    const value = line.substring(colonIdx + 1).trim();
                    const camelKey = key.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
                    meta[camelKey] = value;
                }
            });
            rawMarkdown = content.replace(postInfoRegex, '').trim();
        }

        // 1. Convert Markdown to HTML
        Logger.debug("Raw markdown: at (extractEditorialData)", rawMarkdown + "\n");
        let htmlPostBodyContent = marked.parse(rawMarkdown) as string;
        Logger.debug("HTML content: at (extractEditorialData)", htmlPostBodyContent + "\n");
        // 2. Wrap in Gutenberg Blocks
        //htmlPostBodyContent = this.wrapInGutenbergBlocks(htmlPostBodyContent);
        //Logger.debug("HTML content gutenberg: at (extractEditorialData)", htmlPostBodyContent + "\n");
        return { meta, htmlPostBodyContent };
    }

    /**
 * Extracts SE0 and Content Metadata from raw editorial content.
 */
    /**
     * Removes H1 and Featured Image from HTML content.
     */
    private static removeH1FeatureImg(html: string): string {
        const $ = cheerio.load(html);
        $('h1').first().remove();
        $('figure').has('img.featured').first().remove();
        // Return only the inner content
        return $('body').html() || html;
    }

    /**
     * Wraps raw HTML tags in WordPress Gutenberg block comments.
     */

    private static wrapInGutenbergBlocks(html: string): string {
        const $ = cheerio.load(html);
        let blocks = '';

        $('body').children().each((_, el) => {
            const $el = $(el);
            const tag = (el as any).tagName?.toLowerCase();
            if (!tag) return;

            const content = $.html(el);

            if (tag.match(/^h[1-6]$/)) {
                const level = tag.substring(1);
                blocks += `<!-- wp:heading {"level":${level}} -->${content}<!-- /wp:heading -->\n\n`;
            } else if (tag === 'p') {
                blocks += `<!-- wp:paragraph -->${content}<!-- /wp:paragraph -->\n\n`;
            } else if (tag === 'ul' || tag === 'ol') {
                blocks += `<!-- wp:list -->${content}<!-- /wp:list -->\n\n`;
            } else if (tag === 'figure' || tag === 'img') {
                if (tag === 'figure') {
                    const figureClasses = "wp-block-image aligncenter";
                    $el.addClass(figureClasses);
                    $el.find('figcaption').addClass('wp-element-caption');

                    // ✅ Clean img class and style inside figure
                    $el.find('img').removeAttr('class');
                    $el.find('img').removeAttr('style');

                    const updatedContent = $.html(el);
                    blocks += `<!-- wp:image {"align":"center"} -->${updatedContent}<!-- /wp:image -->\n\n`;
                    Logger.debug("Updated content block at tag=figure: tag:" + tag + " at (wrapInGutenbergBlocks)", blocks + "\n");
                } else {
                    $el.find('img').removeAttr('class');
                    $el.find('img').removeAttr('style');
                    $el.removeClass('in-body');
                    $el.removeAttr('class');
                    $el.removeAttr('style');
                    const src = $el.attr('src');
                    const alt = $el.attr('alt') || '';
                    const title = $el.attr('title') || '';
                    const imgHtml = `<figure class="wp-block-image aligncenter"><img src="${src}" alt="${alt}" title="${title}"/></figure>`;
                    blocks += `<!-- wp:image {"align":"center"} -->${imgHtml}<!-- /wp:image -->\n\n`;
                    Logger.debug("Updated content block at tag=img: tag:" + tag + " at (wrapInGutenbergBlocks)", blocks + "\n");
                }
            } else if (tag === 'blockquote') {
                blocks += `<!-- wp:quote -->${content}<!-- /wp:quote -->\n\n`;
            }
            else if (tag === 'table') {
                const tableBlockAlignment = { "align": "wide" };
                const figureClasses = "wp-block-table table-container alignwide";
                $el.removeAttr('class').removeAttr('style');
                $(el).find('colgroup').remove();
                $(el).find('td p, th p').each(function () {
                    $(this).replaceWith($(this).contents());
                });
                $(el).addClass('has-fixed-layout');
                $(el).find('tr').each(function () {
                    $(this).find('th, td').last()
                        .addClass('has-text-align-center')
                        .attr('data-align', 'center');
                });
                const updatedTable = $.html(el);

                // ✅ scroll hint injected here, hidden on desktop, visible on mobile via CSS
                const scrollHint = `<p class="rmits-scroll-hint">← Scroll to see more →</p>`;
                const wrappedContent = `<figure class="${figureClasses}">${scrollHint}<div class="responsive-table-wrapper-mits">${updatedTable}</div></figure>`;
                blocks += `<!-- wp:table ${JSON.stringify(tableBlockAlignment)} -->${wrappedContent}<!-- /wp:table -->\n\n`;
            }
        });

        Logger.debug("HTML content gutenberg full: at (wrapInGutenbergBlocks)", blocks + "\n");
        return blocks || html;
    }

    /**
     * Extracts the first occurrence of <figure><img class="featured"> </figure>
     */
    private static extractFeaturedImage(html: string) {
        const $ = cheerio.load(html);
        const figure = $('figure').has('img.featured').first();

        if (figure.length > 0) {
            const img = figure.find('img.featured');
            return {
                src: img.attr('src') || '',
                alt: img.attr('alt') || '',
                title: img.attr('title') || '',
                figcaption: figure.find('figcaption').text().trim(),
                imageType: 'featured'
            };
        }
        return null;
    }

    /**
     * Extracts the detailed description from the [IMAGE] block in writer output.
     */
    private static extractImageDescriptionFromJob(content: string): string {
        const imageBlockRegex = /\[IMAGE([\s\S]*?)\]/g;
        let match;

        while ((match = imageBlockRegex.exec(content)) !== null) {
            const block = match[1];
            if (block.includes('type') && block.includes('featured')) {
                const descMatch = block.match(/description\s*:\s*([\s\S]*?)(?=\n\s*[a-z]+\s*:|$)/i);
                if (descMatch) {
                    return descMatch[1].trim();
                }
            }
        }
        return "";
    }
}
