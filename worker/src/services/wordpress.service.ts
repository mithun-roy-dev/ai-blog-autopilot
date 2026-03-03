import axios from "axios"

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
     * Fetches posts from a WordPress site.
     * @param baseUrl The base URL of the WordPress site (e.g., https://example.com)
     * @param apiKey Optional Application Password for authentication
     * @param perPage Number of posts to fetch per page
     */
    static async fetchPosts(baseUrl: string, apiKey?: string, perPage: number = 20): Promise<WPPost[]> {
        const url = `${baseUrl}/wp-json/wp/v2/posts?per_page=${perPage}`

        // If an API key is provided, use it for authentication
        const headers: Record<string, string> = {}
        if (apiKey) {
            const auth = Buffer.from(apiKey).toString("base64")
            headers["Authorization"] = `Basic ${auth}`
        }

        const response = await axios.get<WPPost[]>(url, { headers })
        return response.data
    }

    /**
     * Extracts clean text from WordPress HTML content.
     */
    static cleanHtml(html: string): string {
        // Basic cleaning logic for now
        return html.replace(/<[^>]*>/g, "").trim()
    }
}
