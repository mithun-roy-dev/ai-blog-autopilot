import { SupabaseService } from './supabase.service';
import { WordPressService } from './wordpress.service';
import { PromptService } from './prompt.service';
import { LLMService } from './llm.service';
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
                        id,
                        site_type,
                        site_niche,
                        site_description,
                        target_country,
                        author_name,
                        author_url
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

            //**description loaded */
            let descriptionAllImages: string[] = [];
            const articleWritingJobId = article.internal_url?.split('/').pop();

            try {
                if (articleWritingJobId) {
                    Logger.debug(context, `Fetching original job ${articleWritingJobId} for image metadata...`);
                    const { data: jobData } = await supabase
                        .from('writing_jobs')
                        .select('generation_data')
                        .eq('id', articleWritingJobId)
                        .single();

                    if (jobData?.generation_data?.article_content) {
                        descriptionAllImages = this.extractAllImageDescriptionFromWriterContent(jobData.generation_data.article_content);
                        Logger.debug(context, "Extracted detailed all image description from job data. descriptionAllImages:\n" + descriptionAllImages + "\n");
                    }
                }
            } catch (jobErr: any) {
                Logger.debug(context, "Could not fetch original job description: " + jobErr.message + "\n");
            }
            //description loaded ended

            //**new added handle all
            let imageInArticles = [];
            imageInArticles = this.extractAllImagesData(htmlPostBodyContent, descriptionAllImages);
            Logger.debug(context, "Extracted detailed all image description from job data. imageInArticles:\n" + imageInArticles + "\n");
            //**new added handle all images

            //**upload images in wp */
            let uploadedImages = [];
            uploadedImages = await WordPressService.bulkUploadImages(imageInArticles, blog.url, wpUser, wpKey, 500);
            Logger.debug(context, "Uploaded images to WordPress. uploadedImages:\n" + uploadedImages + "\n");
            //**upload images in wp end */

            //**set wordpress src for all images and get the html*/
            let htmlPostBodyContentWithWpSrc = htmlPostBodyContent;

            htmlPostBodyContentWithWpSrc = this.setImageWPSrc(htmlPostBodyContent, uploadedImages);
            Logger.debug(context, "HTML content with WordPress src:\n" + htmlPostBodyContentWithWpSrc + "\n");
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

            const maxTags = settings?.max_article_tags ?? 0;
            let tagIds: number[] = [];

            if (maxTags > 0) {
                let tagNames = (meta.primaryKeyword || '').split(',').map((s: string) => s.trim()).filter(Boolean)
                tagNames = tagNames.concat((meta.secondaryKeywords || '').split(',').map((s: string) => s.trim()).filter(Boolean));
                Logger.debug(context, "Tag names:" + tagNames + "\n");
                tagIds = await WordPressService.getAndCreateTagIdsAllByNames(tagNames, maxTags, 500, blog.url, wpKey, wpUser);
            } else {
                Logger.debug(context, "Skipping tag creation (Max Article Tags = 0)\n");
            }

            // Clean HTML (Remove H1 and Featured Img) BEFORE Gutenberg wrapping
            const cleanHtml = this.removeH1FeatureImg(htmlPostBodyContentWithWpSrc);
            let htmlPostContentGutenberg = this.wrapInGutenbergBlocks(cleanHtml);
            Logger.debug(context, "HTML content after removing H1 and Featured Img and wrapping in Gutenberg blocks:\n" + htmlPostContentGutenberg + "\n");

            // SEO Schema Generation — inject JSON-LD before WordPress content if enabled
            if (settings?.enable_seo_schema_generation) {
                try {
                    const schemaBlock = await this.generateSeoSchema({
                        meta,
                        htmlPostBodyContentWithWpSrc,
                        article,
                        blogInfo: blog,
                        context
                    });
                    if (schemaBlock) {
                        htmlPostContentGutenberg = htmlPostContentGutenberg + '\n' + schemaBlock;
                        Logger.info(context, '🧩 SEO JSON-LD schema injected into post content.');
                        Logger.debug(context, "schemaBlock:" + schemaBlock + "\n" + "htmlPostContentGutenberg:\n" + htmlPostContentGutenberg + "\n");
                    }
                } catch (schemaErr: any) {
                    // Non-fatal — log and continue publishing without schema
                    Logger.error(context, `⚠️ SEO schema generation failed (non-fatal): ${schemaErr.message}`);
                    Logger.debug(context, "HEO schema generation failed (non-fatal): " + schemaErr.message + '\n');
                }
            }

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

            /*if (featuredMediaId) postData.featured_media = featuredMediaId;*/
            if (uploadedImages.length > 0) postData.featured_media = uploadedImages[0].id;

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
 * Extracts the all occurrence of images from the content
 */
    private static extractAllImagesData(html: string, allImageDescription: string[]) {
        const $ = cheerio.load(html);
        const images = [];
        let imageIndex = 0;
        Logger.debug("Publisher: extractAllImagesData", "All images description: " + JSON.stringify(allImageDescription) + " Length: " + allImageDescription.length);
        while ($('figure').has('img') && imageIndex < allImageDescription.length) {
            const figure = $('figure').has('img').first();
            if (figure.length > 0) {
                const img = figure.find('img');
                const safeImageTitle = img.attr('title').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
                const ext = img.attr('src').split('.').pop()?.split('?')[0] || 'webp';
                const imageType = img.attr('class').includes('in-body') ? 'in-body' : 'featured';
                const seoFileName = `${safeImageTitle}-${imageType}.${ext}`;
                images.push({
                    //design a model for this return
                    src: img.attr('src') || '',
                    alt: img.attr('alt') || '',
                    title: img.attr('title') || '',
                    description: allImageDescription[imageIndex] || 'Description by AI Autopilot',
                    figcaption: figure.find('figcaption').text().trim(),
                    imageType: imageType,
                    seoFileName: seoFileName
                });
                figure.remove();
                Logger.debug("Publisher: extractAllImagesData", "Single Image extracted successfully: " + img.attr('src') + " Images: " + JSON.stringify(images));
            }
            imageIndex++;
            Logger.debug("Publisher: extractAllImagesData", "Image index: " + imageIndex);
        }
        if (images.length < 0) {
            Logger.debug("Publisher: extractAllImagesData", "No images extracted successfully: " + images);
            return [];
        }
        Logger.debug("Publisher: extractAllImagesData", "All images extracted successfully: " + images);
        return images;
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

    /**
 * Extracts the detailed description from the [IMAGE] block in writer output.
 */
    private static extractAllImageDescriptionFromWriterContent(writerContent: string): string[] {
        const imageBlockRegex = /\[IMAGE([\s\S]*?)\]/g;
        let match;
        const descMatchImages: string[] = [];

        while ((match = imageBlockRegex.exec(writerContent)) !== null) {
            const block = match[1];
            if (block.includes('type') && (block.includes('in-body') || block.includes('featured'))) {
                const descMatch = block.match(/description\s*:\s*([\s\S]*?)(?=\n\s*[a-z]+\s*:|$)/i);
                if (descMatch && descMatch[1]) {
                    const description = descMatch[1].trim();
                    descMatchImages.push(description);
                    Logger.debug("Publisher: extractAllImageDescriptionFromWriterContent", "Image description extracted: " + description);
                }
            }
        }
        Logger.debug("Publisher: extractAllImageDescriptionFromWriterContent", "All image descriptions extracted: " + descMatchImages.length);
        return descMatchImages;
    }

    /**
* Extracts the all occurrence of images from the content
*/
    private static setImageWPSrc(html: string, uploadedImages: any[]) {
        const $ = cheerio.load(html);
        const images = $('figure').has('img');

        images.each((i, el) => {
            if (uploadedImages[i] && uploadedImages[i].newWpUrl) {
                $(el).find('img').attr('src', uploadedImages[i].newWpUrl);
                Logger.debug("Publisher: setImageWPSrc", `Updated image ${i} with WP URL: ${uploadedImages[i].newWpUrl}`);
            }
        });

        const updatedHtml = $('body').html() || html;
        Logger.debug("Publisher: setImageWPSrc", "All images src set successfully. updatedHtml");
        return updatedHtml;
    }
    /**
     * Generates a JSON-LD <script> block for the article using the configured
     * SEO schema prompt and LLM model. Falls back to a built-in BlogPosting
     * schema template if no prompt is configured or LLM call fails.
     */
    private static async generateSeoSchema({
        meta,
        htmlPostBodyContentWithWpSrc,
        article,
        blogInfo,
        context
    }: {
        meta: any;
        htmlPostBodyContentWithWpSrc: string;
        article: any;
        blogInfo: any;
        context: string;
    }): Promise<string | null> {
        const supabase = SupabaseService.getClient();
        Logger.debug(context, '[SEO Schema] Starting schema generation...');

        // 1. Fetch seo_schema_prompt slug from system_settings
        const { data: sysData } = await supabase
            .from('system_settings')
            .select('value')
            .eq('key', 'logging_config')
            .single();

        const promptSlug: string = sysData?.value?.seo_schema_prompt || '';
        Logger.debug(context, `[SEO Schema] Prompt slug from settings: "${promptSlug}"`);

        // 2. Build article variables available for prompt injection
        const articleUrl = `${blogInfo.url}/${article.slug}` || article.source_url;
        const authorName = blogInfo.author_name || 'Editorial Team';
        const authorUrl = blogInfo.author_url || blogInfo.url;
        const siteUrl = blogInfo.url;
        const siteName = blogInfo.name;
        const siteDescription = blogInfo.site_description;
        const siteNiche = blogInfo.site_niche;
        const datePublished = article.created_at
            ? new Date(article.created_at).toISOString().split('T')[0]
            : new Date().toISOString().split('T')[0];
        const dateModified = article.updated_at
            ? new Date(article.updated_at).toISOString().split('T')[0]
            : datePublished;

        // Strip HTML tags to get clean plain text for the LLM — capped at 32000 chars (~6000 tokens)
        // const articlePlainText = (article.content || '')
        //  .replace(/<[^>]+>/g, ' ')   // strip all HTML tags
        // .replace(/&[a-z]+;/gi, ' ') // decode common HTML entities
        // .replace(/\s{2,}/g, ' ')    // collapse whitespace
        // .trim()
        // .substring(0, 32000);

        const variables: Record<string, string> = {
            title: meta.h1Title || article.title || '',
            metaTitle: meta.metaTitle || article.title || '',
            metaDesc: meta.metaDesc || '',
            keyword: meta.primaryKeyword || '',
            secondaryKeywords: meta.secondaryKeywords || '',
            slug: article.slug || '',
            url: articleUrl,
            siteUrl: siteUrl,
            author: authorName,
            authorUrl: authorUrl,
            siteName: siteName,
            siteDescription: siteDescription,
            siteNiche: siteNiche,
            datePublished,
            dateModified,
            articleHtmlContent: htmlPostBodyContentWithWpSrc.substring(0, 50000),   // full article html with wp src for LLM content analysis
        };

        let schemaJson: any;

        // 3. Try prompt-driven generation
        if (promptSlug) {
            const promptConfig = await PromptService.getPrompt(promptSlug);

            if (promptConfig) {
                const systemPrompt = PromptService.injectVariables(promptConfig.system_prompt, variables);
                const userPrompt = PromptService.injectVariables(promptConfig.user_prompt_template, variables);

                Logger.debug(context, `[SEO Schema] Calling LLM (taskRef=seo_schema) with prompt "${promptSlug}"`);

                try {
                    const rawResponse = await LLMService.completion({
                        system: systemPrompt,
                        user: userPrompt,
                        taskRef: 'seo_schema',
                        json: true,
                    });

                    // Strip markdown code fences if present, then parse
                    const cleaned = rawResponse.trim().replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '');
                    schemaJson = JSON.parse(cleaned);
                    Logger.debug(context, '[SEO Schema] LLM returned valid JSON schema.');
                } catch (llmErr: any) {
                    Logger.warn(context, `[SEO Schema] LLM call failed: ${llmErr.message}. Using built-in fallback.`);
                    Logger.debug(context, `[SEO Schema] LLM call failed: ${llmErr}`);
                }
            } else {
                Logger.warn(context, `[SEO Schema] Prompt slug "${promptSlug}" not found in DB. Using built-in fallback.`);
                Logger.debug(context, `[SEO Schema] Prompt slug "${promptSlug}" not found in DB. Using built-in fallback.`);
            }
        }

        // 4. Built-in fallback — @graph bundle with 5 always-required schema nodes
        if (!schemaJson) {
            const allKeywords = [
                variables.keyword,
                ...variables.secondaryKeywords.split(',').map((s: string) => s.trim())
            ].filter(Boolean);

            schemaJson = {
                '@context': 'https://schema.org',
                '@graph': [
                    {
                        '@type': 'BlogPosting',
                        'headline': variables.metaTitle,
                        'description': variables.metaDesc,
                        'url': variables.url,
                        'mainEntityOfPage': { '@type': 'WebPage', '@id': variables.url },
                        'author': { '@id': variables.authorUrl },
                        'publisher': { '@id': `${variables.siteUrl}/#organization` },
                        'datePublished': variables.datePublished,
                        'dateModified': variables.dateModified,
                        'keywords': allKeywords,
                        'inLanguage': 'en-US',
                        'speakable': {
                            '@type': 'SpeakableSpecification',
                            'cssSelector': ['h1', '.entry-content p:first-of-type']
                        }
                    },
                    {
                        '@type': 'BreadcrumbList',
                        'itemListElement': [
                            { '@type': 'ListItem', 'position': 1, 'name': 'Home', 'item': variables.siteUrl },
                            { '@type': 'ListItem', 'position': 2, 'name': variables.siteNiche || 'Blog', 'item': variables.siteUrl },
                            { '@type': 'ListItem', 'position': 3, 'name': variables.title, 'item': variables.url }
                        ]
                    },
                    {
                        '@type': 'Person',
                        '@id': variables.authorUrl,
                        'name': variables.author,
                        'url': variables.authorUrl
                    },
                    {
                        '@type': 'Organization',
                        '@id': `${variables.siteUrl}/#organization`,
                        'name': variables.siteName,
                        'url': variables.siteUrl,
                        'logo': { '@type': 'ImageObject', 'url': `${variables.siteUrl}/favicon.ico` },
                        'description': variables.siteDescription || ''
                    },
                    {
                        '@type': 'WebSite',
                        '@id': `${variables.siteUrl}/#website`,
                        'url': variables.siteUrl,
                        'name': variables.siteName,
                        'description': variables.siteDescription || '',
                        'publisher': { '@id': `${variables.siteUrl}/#organization` }
                    }
                ]
            };
            Logger.debug(context, '[SEO Schema] Using built-in @graph fallback schema (5 nodes).');
        }

        // 5. Validate minimum required fields — supports both @graph bundle and single-object formats
        const isGraphBundle = Array.isArray(schemaJson['@graph']) && schemaJson['@graph'].length > 0;
        const isSingleObject = !!schemaJson['@type'];
        if (!schemaJson['@context'] || (!isGraphBundle && !isSingleObject)) {
            Logger.debug(context, '[SEO Schema] Invalid schema structure (missing @context or empty @graph/@type):', JSON.stringify(schemaJson));
            Logger.warn(context, '[SEO Schema] Generated schema is invalid. Aborting injection.');
            return null;
        }
        if (isGraphBundle) {
            Logger.debug(context, `[SEO Schema] @graph bundle validated — ${schemaJson['@graph'].length} schema nodes.`);
        }

        // Use JSON.stringify without formatting to avoid \n which wpautop turns into <br />
        // Wrap in wp:html to prevent Gutenberg/wpautop from wrapping it in <p> tags
        const jsonLdBlock = `<!-- wp:html -->\n<script type="application/ld+json">${JSON.stringify(schemaJson)}</script>\n<!-- /wp:html -->`;

        Logger.info(context, '[SEO Schema] ✅ Schema block ready for injection.');
        Logger.debug(context, `[SEO Schema] JSON-LD block: ${JSON.stringify(jsonLdBlock)}`);
        return jsonLdBlock;
    }


}
