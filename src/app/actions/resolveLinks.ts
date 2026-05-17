"use server"

import { createClient } from "@/utils/supabase/server"

export async function resolveInternalLinksAction(shortLinks: string[]) {
    if (!shortLinks || shortLinks.length === 0) return {};

    const supabase = await createClient();
    const mapping: Record<string, string> = {};

    try {
        // 1. Fetch matching articles from Supabase
        const { data: articles, error } = await supabase
            .from("articles")
            .select(`
                id, 
                source_url,
                blogs (
                    site_type
                )
            `)
            .in("source_url", shortLinks);

        if (error) {
            console.error("Error fetching articles for link resolution:", error);
            return mapping;
        }

        if (!articles || articles.length === 0) return mapping;

        // 2. Resolve each link via WP API
        for (const article of articles) {
            const shortLink = article.source_url;
            if (!shortLink) continue;

            // Only resolve links for WordPress sites
            const siteType = (article.blogs as any)?.site_type?.toLowerCase();
            if (siteType !== "wordpress") continue;

            // Pattern: https://example.com/?p=1 to // Pattern: https://example.com/?p=99999999
            const match = shortLink.match(/^(https?:\/\/[^\/]+)\/\?p=(\d+)/);
            if (!match) continue;

            const baseUrl = match[1];
            const postId = match[2];

            try {
                // Fetch the published permalink from WordPress REST API
                const wpResponse = await fetch(`${baseUrl}/wp-json/wp/v2/posts/${postId}`, {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' },
                });

                if (wpResponse.ok) {
                    const postData = await wpResponse.json();
                    const liveLink = postData.link;

                    if (liveLink && liveLink !== shortLink) {
                        // 3. Update Supabase
                        await supabase
                            .from("articles")
                            .update({ source_url: liveLink })
                            .eq("id", article.id);

                        mapping[shortLink] = liveLink;
                    }
                } else {
                    console.error(`Failed to resolve WP post ${postId} at ${baseUrl}: ${wpResponse.status}`);
                }
            } catch (fetchError) {
                console.error(`Fetch error resolving WP post ${postId}:`, fetchError);
            }
        }
    } catch (e) {
        console.error("Unexpected error in resolveInternalLinksAction:", e);
    }

    return mapping;
}
