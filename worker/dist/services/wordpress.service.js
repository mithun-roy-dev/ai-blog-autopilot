"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WordPressService = void 0;
const axios_1 = __importDefault(require("axios"));
class WordPressService {
    /**
     * Fetches content (posts or pages) from a WordPress site with pagination.
     */
    static async fetchContent(baseUrl, contentType = 'posts', apiKey, wpUsername, perPage = 20) {
        let allItems = [];
        let page = 1;
        let hasMore = true;
        while (hasMore && page <= 10) { // Limit to 10 pages (~200 items) for now
            const url = `${baseUrl}/wp-json/wp/v2/${contentType}?per_page=${perPage}&page=${page}`;
            const headers = {};
            if (apiKey && wpUsername) {
                const auth = Buffer.from(`${wpUsername}:${apiKey}`).toString("base64");
                headers["Authorization"] = `Basic ${auth}`;
            }
            try {
                const response = await axios_1.default.get(url, { headers });
                const items = response.data;
                if (items.length > 0) {
                    allItems = [...allItems, ...items];
                    page++;
                    // Check if there are more pages based on X-WP-TotalPages header
                    const totalPages = parseInt(response.headers['x-wp-totalpages'] || '1');
                    hasMore = page <= totalPages;
                }
                else {
                    hasMore = false;
                }
            }
            catch (error) {
                console.warn(`[WP] ⚠️ Failed to fetch page ${page} for ${contentType}:`, error.message);
                hasMore = false;
            }
        }
        return allItems;
    }
    /**
     * Attempts to find and parse URLs from sitemap, including nested sitemaps.
     */
    static async discoverSitemapUrls(baseUrl) {
        const sitemapsToProcess = [`${baseUrl}/wp-sitemap.xml`, `${baseUrl}/sitemap.xml`, `${baseUrl}/sitemap_index.xml`];
        const foundUrls = new Set();
        const processedSitemaps = new Set();
        while (sitemapsToProcess.length > 0) {
            const currentSitemap = sitemapsToProcess.shift();
            if (processedSitemaps.has(currentSitemap))
                continue;
            processedSitemaps.add(currentSitemap);
            try {
                const response = await axios_1.default.get(currentSitemap, { timeout: 10000 });
                const xml = response.data;
                const locs = xml.match(/<loc>(.*?)<\/loc>/g);
                if (!locs)
                    continue;
                const extracted = locs.map((loc) => loc.replace(/<\/?loc>/g, ""));
                for (const url of extracted) {
                    if (url.endsWith('.xml')) {
                        sitemapsToProcess.push(url);
                    }
                    else {
                        foundUrls.add(url);
                    }
                }
                // Safety break to prevent infinite loops or massive discovery
                if (foundUrls.size > 500)
                    break;
                if (processedSitemaps.size > 20)
                    break;
            }
            catch (error) {
                console.warn(`[Sitemap] ⚠️ Could not fetch sitemap: ${currentSitemap}`);
            }
        }
        return Array.from(foundUrls);
    }
    /**
     * Extracts basic metadata (title, description) from a generic URL.
     */
    static async fetchUrlMetadata(url) {
        try {
            const response = await axios_1.default.get(url, { timeout: 5000 });
            const html = response.data;
            const titleMatch = html.match(/<title>(.*?)<\/title>/i);
            const title = titleMatch ? titleMatch[1] : url.split('/').pop() || 'Untitled';
            const descMatch = html.match(/<meta name="description" content="(.*?)"/i) || html.match(/<meta property="og:description" content="(.*?)"/i);
            const excerpt = descMatch ? descMatch[1] : 'No description available';
            return { title, excerpt };
        }
        catch (error) {
            return { title: url.split('/').pop() || 'Untitled', excerpt: 'Snippet not available' };
        }
    }
    /**
     * Extracts clean text from WordPress HTML content.
     */
    static cleanHtml(html) {
        // Basic cleaning logic for now
        return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();
    }
}
exports.WordPressService = WordPressService;
