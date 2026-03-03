"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.IntelligenceService = void 0;
const axios_1 = __importDefault(require("axios"));
const cheerio = __importStar(require("cheerio"));
const supabase_service_1 = require("./supabase.service");
class IntelligenceService {
    supabase = new supabase_service_1.SupabaseService();
    async processSiteIntelligence(blogId) {
        console.log(`[Intelligence] Starting deep crawl for blog: ${blogId}`);
        try {
            // 1. Fetch all synced articles/urls for this blog
            const { data: articles, error } = await supabase_service_1.SupabaseService.getClient()
                .from('articles')
                .select('id, source_url, title')
                .eq('blog_id', blogId);
            if (error)
                throw error;
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
                }
                catch (err) {
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
        }
        catch (err) {
            console.error(`[Intelligence] Error:`, err.message);
            throw err;
        }
    }
    async crawlAndExtract(blogId, articleId, url) {
        console.log(`[Intelligence] Crawling: ${url}`);
        // Update status to processing
        await supabase_service_1.SupabaseService.getClient()
            .from('site_intelligence')
            .upsert({
            article_id: articleId,
            blog_id: blogId,
            status: 'processing',
            updated_at: new Date().toISOString()
        }, { onConflict: 'article_id' });
        try {
            const response = await axios_1.default.get(url, {
                timeout: 15000,
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
            });
            const $ = cheerio.load(response.data);
            // 1. Identify main content container for cleaner extraction
            const $content = this.getMainContentContainer($);
            // Extract data
            const title = $('title').text().trim() || $('meta[property="og:title"]').attr('content') || '';
            const metaDescription = $('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || '';
            // Prioritize headers inside the main content
            const h1 = $content.find('h1').first().text().trim() || $('h1').first().text().trim();
            const h2 = $content.find('h2').map((_, el) => $(el).text().trim()).get().filter(t => t);
            if (h2.length === 0)
                h2.push(...$('h2').map((_, el) => $(el).text().trim()).get().filter(t => t));
            const h3 = $content.find('h3').map((_, el) => $(el).text().trim()).get().filter(t => t);
            const h4 = $content.find('h4').map((_, el) => $(el).text().trim()).get().filter(t => t);
            const h5 = $content.find('h5').map((_, el) => $(el).text().trim()).get().filter(t => t);
            const h6 = $content.find('h6').map((_, el) => $(el).text().trim()).get().filter(t => t);
            // Word count (only from relevant content)
            const textContent = $content.text();
            const wordCount = textContent.split(/\s+/).filter(w => w.length > 0).length;
            // Categories/Tags (common patterns in WP and others)
            const categories = $('meta[property="article:section"]').attr('content') || '';
            const tags = $('meta[property="article:tag"]').map((_, el) => $(el).attr('content')).get().filter(t => t);
            // Internal links (ONLY inside the main content)
            const internalLinks = [];
            const baseUrl = new URL(url).origin;
            $content.find('a[href]').each((_, el) => {
                const href = $(el).attr('href');
                if (href && (href.startsWith('/') || href.startsWith(baseUrl))) {
                    internalLinks.push({
                        text: $(el).text().trim(),
                        href: href.startsWith('/') ? `${baseUrl}${href}` : href
                    });
                }
            });
            // If content links are empty, fallback to whole page restricted by common noise reduction
            if (internalLinks.length === 0) {
                $('a[href]').each((_, el) => {
                    const href = $(el).attr('href');
                    const isInternal = href && (href.startsWith('/') || href.startsWith(baseUrl));
                    // Simple heuristic to ignore menu/footer links if we couldn't find a container
                    const parentClass = $(el).parents().map((_, p) => $(p).attr('class') || '').get().join(' ');
                    const isNoise = /menu|nav|sidebar|footer/i.test(parentClass);
                    if (isInternal && !isNoise) {
                        internalLinks.push({
                            text: $(el).text().trim(),
                            href: href.startsWith('/') ? `${baseUrl}${href}` : href
                        });
                    }
                });
            }
            const schemaType = $('script[type="application/ld+json"]').map((_, el) => {
                try {
                    const json = JSON.parse($(el).html() || '{}');
                    return json['@type'] || (Array.isArray(json['@graph']) ? json['@graph'].map((i) => i['@type']) : null);
                }
                catch {
                    return null;
                }
            }).get().filter(t => t).join(', ');
            const canonical = $('link[rel="canonical"]').attr('href') || '';
            // 3. Save to database
            const { error } = await supabase_service_1.SupabaseService.getClient()
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
            if (error)
                throw error;
        }
        catch (err) {
            console.error(`[Intelligence] Crawl failed for ${url}:`, err.message);
            await supabase_service_1.SupabaseService.getClient()
                .from('site_intelligence')
                .upsert({
                article_id: articleId,
                blog_id: blogId,
                status: 'failed',
                updated_at: new Date().toISOString()
            }, { onConflict: 'article_id' });
        }
    }
    async updateProgress(blogId, info) {
        try {
            const { data: blog } = await supabase_service_1.SupabaseService.getClient()
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
            await supabase_service_1.SupabaseService.getClient()
                .from('blogs')
                .update({ metadata: newMetadata })
                .eq('id', blogId);
        }
        catch (err) {
            console.error(`[Intelligence] Failed to update progress for ${blogId}:`, err.message);
        }
    }
    /**
     * Attempts to find the primary content container of a page.
     * This helps ignore menus, footers, and sidebars.
     */
    getMainContentContainer($) {
        const selectors = [
            '.entry-content', // WordPress standard
            '.post-content', // Common WP and others
            'article', // Semantic HTML
            '.article-content',
            '.post-body',
            'main', // Semantic HTML
            '#content', // Common ID
            '.content', // Common class
            '#main', // Common ID
            '.body-content'
        ];
        for (const selector of selectors) {
            const $el = $(selector);
            // Ensure the container has significant text content (avoid empty sidebars/navs)
            if ($el.length > 0 && $el.text().trim().length > 200) {
                return $el;
            }
        }
        // Fallback to body but attempt to remove obvious noise if possible
        const $body = $('body').clone();
        $body.find('nav, footer, header, .sidebar, #sidebar, .menu, #menu, script, style, .nav').remove();
        return $body;
    }
}
exports.IntelligenceService = IntelligenceService;
