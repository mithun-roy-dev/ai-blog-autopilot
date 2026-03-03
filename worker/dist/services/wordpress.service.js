"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WordPressService = void 0;
const axios_1 = __importDefault(require("axios"));
class WordPressService {
    /**
     * Fetches posts from a WordPress site.
     * @param baseUrl The base URL of the WordPress site (e.g., https://example.com)
     * @param apiKey Optional Application Password for authentication
     * @param perPage Number of posts to fetch per page
     */
    static async fetchPosts(baseUrl, apiKey, perPage = 20) {
        const url = `${baseUrl}/wp-json/wp/v2/posts?per_page=${perPage}`;
        // If an API key is provided, use it for authentication
        const headers = {};
        if (apiKey) {
            const auth = Buffer.from(apiKey).toString("base64");
            headers["Authorization"] = `Basic ${auth}`;
        }
        const response = await axios_1.default.get(url, { headers });
        return response.data;
    }
    /**
     * Extracts clean text from WordPress HTML content.
     */
    static cleanHtml(html) {
        // Basic cleaning logic for now
        return html.replace(/<[^>]*>/g, "").trim();
    }
}
exports.WordPressService = WordPressService;
