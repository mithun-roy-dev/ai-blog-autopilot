import axios from "axios"
import { Logger } from "../utils/logger"

export interface WPPost {
    id: number
    title: { rendered: string }
    excerpt: { rendered: string }
    content: { rendered: string }
    slug: string
    link: string
}

export class WordPressService {
    /**
     * Fetches content (posts or pages) from a WordPress site with pagination.
     */
    static async fetchContent(baseUrl: string, contentType: 'posts' | 'pages' = 'posts', apiKey?: string, wpUsername?: string, perPage: number = 20): Promise<WPPost[]> {
        let allItems: WPPost[] = []
        let page = 1
        let hasMore = true

        while (hasMore && page <= 10) { // Limit to 10 pages (~200 items) for now
            const url = `${baseUrl}/wp-json/wp/v2/${contentType}?per_page=${perPage}&page=${page}`

            const headers: Record<string, string> = {}
            if (apiKey && wpUsername) {
                const auth = Buffer.from(`${wpUsername}:${apiKey}`).toString("base64")
                headers["Authorization"] = `Basic ${auth}`
            }

            try {
                const response = await axios.get<WPPost[]>(url, { headers })
                const items = response.data

                if (items.length > 0) {
                    allItems = [...allItems, ...items]
                    page++
                    // Check if there are more pages based on X-WP-TotalPages header
                    const totalPages = parseInt(response.headers['x-wp-totalpages'] || '1')
                    hasMore = page <= totalPages
                } else {
                    hasMore = false
                }
            } catch (error: any) {
                console.warn(`[WP] ⚠️ Failed to fetch page ${page} for ${contentType}:`, error.message)
                hasMore = false
            }
        }

        return allItems
    }

    /**
     * Attempts to find and parse URLs from sitemap, including nested sitemaps.
     * Categorizes URLs by post, page, category, author, and sitemap.
     */
    static async discoverSitemapData(baseUrl: string): Promise<{
        posts: string[],
        pages: string[],
        categories: string[],
        authors: string[],
        sitemaps: string[]
    }> {
        const results = {
            posts: [] as string[],
            pages: [] as string[],
            categories: [] as string[],
            authors: [] as string[],
            sitemaps: [] as string[]
        }

        const sitemapsToProcess = new Set<string>()
        const processedSitemaps = new Set<string>()

        // 1. Check robots.txt for Sitemap directives
        try {
            const robotsRes = await axios.get(`${baseUrl}/robots.txt`, { timeout: 5000 })
            const robotsContent = robotsRes.data
            const sitemapMatches = robotsContent.match(/^Sitemap:\s*(.*)$/gmi)
            if (sitemapMatches) {
                sitemapMatches.forEach((line: string) => {
                    const url = line.replace(/^Sitemap:\s*/i, '').trim()
                    if (url) sitemapsToProcess.add(url)
                })
            }
        } catch (e) {
            console.log(`[Sitemap] ℹ️ robots.txt not found or inaccessible for ${baseUrl}`)
        }

        // 2. Add common sitemap locations
        const commonSitemaps = [
            `${baseUrl}/sitemap_index.xml`,
            `${baseUrl}/sitemap.xml`,
            `${baseUrl}/wp-sitemap.xml`,
            `${baseUrl}/sitemap_index.xml.gz`,
            `${baseUrl}/sitemap.xml.gz`
        ]
        commonSitemaps.forEach(s => sitemapsToProcess.add(s))

        const sitemapQueue = Array.from(sitemapsToProcess)

        while (sitemapQueue.length > 0) {
            const currentSitemap = sitemapQueue.shift()!
            if (processedSitemaps.has(currentSitemap)) continue
            processedSitemaps.add(currentSitemap)

            try {
                const response = await axios.get(currentSitemap, { timeout: 10000 })
                const xml = response.data
                const locs = xml.match(/<loc>(.*?)<\/loc>/g)
                if (!locs) continue

                const extracted = locs.map((loc: string) => loc.replace(/<\/?loc>/g, ""))
                
                // Track this URL as a sitemap if it's an XML file
                if (currentSitemap.endsWith('.xml') || currentSitemap.endsWith('.xml.gz')) {
                    results.sitemaps.push(currentSitemap)
                }

                for (const url of extracted) {
                    if (url.endsWith('.xml') || url.endsWith('.xml.gz')) {
                        sitemapQueue.push(url)
                    } else {
                        // Categorize based on sitemap filename or URL patterns
                        const sitemapLower = currentSitemap.toLowerCase()
                        const urlLower = url.toLowerCase()

                        if (sitemapLower.includes('post')) {
                            results.posts.push(url)
                        } else if (sitemapLower.includes('page')) {
                            results.pages.push(url)
                        } else if (sitemapLower.includes('category')) {
                            results.categories.push(url)
                        } else if (sitemapLower.includes('author')) {
                            results.authors.push(url)
                        } else {
                            // Fallback categorization based on URL segments if sitemap name is generic
                            if (urlLower.includes('/category/')) results.categories.push(url)
                            else if (urlLower.includes('/author/')) results.authors.push(url)
                            else results.posts.push(url) // Default to post
                        }
                    }
                }

                // Safety break to prevent infinite loops or massive discovery
                const totalFound = results.posts.length + results.pages.length + results.categories.length + results.authors.length
                if (totalFound > 1000) break
                if (processedSitemaps.size > 30) break

            } catch (error) {
                // Silently skip failed sitemap fetches
            }
        }

        // De-duplicate results
        return {
            posts: Array.from(new Set(results.posts)),
            pages: Array.from(new Set(results.pages)),
            categories: Array.from(new Set(results.categories)),
            authors: Array.from(new Set(results.authors)),
            sitemaps: Array.from(new Set(results.sitemaps))
        }
    }

    /**
     * Extracts basic metadata (title, description/excerpt) from a generic URL.
     * Extracts first few lines of text from body if meta description is missing.
     */
    static async fetchUrlMetadata(url: string): Promise<{ title: string; excerpt: string }> {
        try {
            const response = await axios.get(url, { 
                timeout: 8000,
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36' }
            })
            const html = response.data

            // 1. Extract Title
            const titleMatch = html.match(/<title>(.*?)<\/title>/i)
            let title = titleMatch ? titleMatch[1] : url.split('/').filter(Boolean).pop() || 'Untitled'

            // 2. Extract Excerpt (Meta Description priority)
            const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/i) || 
                              html.match(/<meta\s+property=["']og:description["']\s+content=["'](.*?)["']/i)
            
            let excerpt = descMatch ? descMatch[1] : ''

            // 3. Fallback: Extract from body if excerpt is missing or too short
            if (!excerpt || excerpt.length < 30) {
                // Remove scripts, styles, and tags
                const bodyText = html
                    .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gmi, '')
                    .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gmi, '')
                    .replace(/<[^>]*>/g, ' ')
                    .replace(/\s+/g, ' ')
                    .trim()
                
                // Get roughly the first 200 characters/2 lines
                excerpt = bodyText.substring(0, 200).trim()
                if (excerpt.length > 0 && excerpt.length < bodyText.length) {
                    excerpt += '...'
                }
            }

            return { 
                title: this.cleanHtml(title), 
                excerpt: this.cleanHtml(excerpt) || 'No summary available'
            }
        } catch (error) {
            return { title: url.split('/').filter(Boolean).pop() || 'Untitled', excerpt: 'Snippet not available' }
        }
    }

    /**
     * Creates a new post on the WordPress site.
     */
    /**
     * Creates a new post on the WordPress site.
     */
    static async createPost(baseUrl: string, postData: any, apiKey: string, wpUsername: string): Promise<WPPost> {
        const url = `${baseUrl}/wp-json/wp/v2/posts`
        const auth = Buffer.from(`${wpUsername}:${apiKey}`).toString("base64")
        Logger.debug("WordPress", `Creating post at ${url}`, postData)

        try {
            const response = await axios.post<WPPost>(url, postData, {
                headers: {
                    "Authorization": `Basic ${auth}`,
                    "Content-Type": "application/json"
                }
            })
            Logger.debug("WordPress", "✅ Post created successfully", response.data)
            return response.data
        } catch (error: any) {
            console.error(`[WP] ❌ Failed to create post at ${url}:`, error.response?.data || error.message)
            Logger.error("WordPress", `❌ Failed to create post at ${url}`, error.response?.data || error.message)
            throw new Error(`WordPress API Error: ${JSON.stringify(error.response?.data) || error.message}`)
        }
    }

    /**
     * Uploads media to WordPress.
     */
    static async uploadMedia(
        baseUrl: string,
        fileBuffer: Buffer,
        mimeType: string,
        fileName: string,
        metadata: { alt: string; caption: string; title: string; description: string },
        apiKey: string,
        wpUsername: string
    ): Promise<number> {
        const url = `${baseUrl}/wp-json/wp/v2/media`
        const auth = Buffer.from(`${wpUsername}:${apiKey}`).toString("base64")

        try {
            // 1. Upload Binary
            const uploadResponse = await axios.post(url, fileBuffer, {
                headers: {
                    "Authorization": `Basic ${auth}`,
                    "Content-Disposition": `attachment; filename="${fileName}"`,
                    "Content-Type": mimeType
                }
            })

            const mediaId = uploadResponse.data.id

            // 2. Update Metadata (Alt, Caption, Title)
            await axios.post(`${url}/${mediaId}`, {
                alt_text: metadata.alt,
                caption: metadata.caption,
                title: metadata.title,
                description: metadata.description,
            }, {
                headers: {
                    "Authorization": `Basic ${auth}`,
                    "Content-Type": "application/json"
                }
            })

            return mediaId
        } catch (error: any) {
            Logger.error("WordPress", `❌ Failed to upload media to ${url}`, error.response?.data || error.message)
            throw new Error(`Media Upload Failed: ${error.message}`)
        }
    }

    /**
     * Finds a category by name/slug or returns null.
     */
    static async getCategoryByName(
        baseUrl: string,
        name: string,
        apiKey: string,
        wpUsername: string
    ): Promise<number | null> {
        const url = `${baseUrl}/wp-json/wp/v2/categories?search=${encodeURIComponent(name)}`
        const auth = Buffer.from(`${wpUsername}:${apiKey}`).toString("base64")

        try {
            const response = await axios.get(url, {
                headers: { "Authorization": `Basic ${auth}` }
            })
            const categories = response.data
            // Look for exact match (search is fuzzy)
            Logger.debug("WordPress: getCategoryByName", "Categories found", categories)
            const match = categories.find((c: any) => c.name.toLowerCase() === name.toLowerCase())
            return match ? match.id : null
        } catch (error) {
            return null
        }
    }

        /**
     * Finds a category by name/slug or returns null.
     */
    static async getOrCreateCategoryByName(
        baseUrl: string,
        name: string,
        description: string,
        apiKey: string,
        wpUsername: string
    ): Promise<number> {
        const url = `${baseUrl}/wp-json/wp/v2/categories`
        const auth = Buffer.from(`${wpUsername}:${apiKey}`).toString("base64")
        const slug = name.toLowerCase().trim().replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-').replace(/^-+|-+$/g, '');
        try {
            const response = await axios.post(url, { name, slug, description: description}, {
                headers: {
                    "Authorization": `Basic ${auth}`,
                    "Content-Type": "application/json"
                }
            })
            if(response.status === 201){
                Logger.debug("WordPress: getOrCreateCategoryByName", "Category created successfully: response.data.id", response.data.id)
                return response.data.id
            }
            else if(response.status === 400 && response.data.code === 'term_exists' && response.data.data.status === 400){
                Logger.debug("WordPress: getOrCreateCategoryByName", "Category already exists: response.data.data.term_id", response.data.data.term_id)
                return response.data.data.term_id;
            }
            return 1; // Fallback to Uncategorized (ID 1)
        } catch (error: any) {
            console.warn(`[WP] ⚠️ Failed to create category "${name}":`, error.response?.data || error.message)
            Logger.debug("WordPress: getOrCreateCategoryByName", "Failed to create category: error.response?.data || error.message", error.response?.data || error.message)
            Logger.error("WordPress: getOrCreateCategoryByName", "Failed to create category", error.response?.data || error.message)
            if(error.response.status === 400 && error.response.data.code === 'term_exists' && error.response.data.data.status === 400){
                Logger.debug("WordPress: getOrCreateCategoryByName catch", "Category already exists: error.response.data.data.term_id", error.response.data.data.term_id)
                return error.response.data.data.term_id;
            }
            return 1; // Fallback to Uncategorized (ID 1)
        }
    }

    /**
     * Creates a new category in WordPress.
     */
    static async createCategory(
        baseUrl: string,
        name: string,
        apiKey: string,
        wpUsername: string
    ): Promise<number> {
        const url = `${baseUrl}/wp-json/wp/v2/categories`
        const auth = Buffer.from(`${wpUsername}:${apiKey}`).toString("base64")

        try {
            const response = await axios.post(url, { name }, {
                headers: {
                    "Authorization": `Basic ${auth}`,
                    "Content-Type": "application/json"
                }
            })
            return response.data.id
        } catch (error: any) {
            console.warn(`[WP] ⚠️ Failed to create category "${name}":`, error.response?.data || error.message)
            return 1; // Fallback to Uncategorized (ID 1)
        }
    }

    /**
     * Finds tags by names or returns empty array as fallback.
     */
    static async getTagIdsByNames(
        baseUrl: string,
        names: string[],
        apiKey: string,
        wpUsername: string
    ): Promise<number[]> {
        if (!names || names.length === 0) return []
        const auth = Buffer.from(`${wpUsername}:${apiKey}`).toString("base64")
        const ids: number[] = []

        for (const name of names) {
            try {
                const url = `${baseUrl}/wp-json/wp/v2/tags?search=${encodeURIComponent(name)}`
                const response = await axios.get(url, {
                    headers: { "Authorization": `Basic ${auth}` }
                })
                const tags = response.data
                const match = tags.find((t: any) => t.name.toLowerCase() === name.toLowerCase())
                if (match) ids.push(match.id)
            } catch (error) {
                // Skip if not found
            }
        }
        return ids
    }


    /**
     * Extracts clean text from WordPress HTML content.
     */
    static cleanHtml(html: string): string {
        // Basic cleaning logic for now
        return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim()
    }
}
