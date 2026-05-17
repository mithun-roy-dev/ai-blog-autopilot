"use server"

import { createClient } from "@/utils/supabase/server"

export async function updateWordpressDraftLinksAction() {
    const supabase = await createClient();

    try {
        // Fetch articles with source_url containing '/?p=' and belong to a WP site
        const { data: articles, error } = await supabase
            .from("articles")
            .select(`
                id, 
                source_url,
                blogs!inner (
                    site_type,
                    platform
                )
            `)
            .ilike("source_url", "%/?p=%");

        if (error) {
            console.error("Error fetching articles for link resolution:", error);
            return { success: false, error: error.message };
        }

        if (!articles || articles.length === 0) {
            console.log("[updateDraftLinks] No articles found matching /?p= pattern.");
            return { success: true, count: 0 };
        }

        console.log(`[updateDraftLinks] Found ${articles.length} articles matching /?p= pattern.`);

        let updateCount = 0;

        for (const article of articles) {
            const draftLink = article.source_url;
            if (!draftLink) continue;

            console.log(`\n[updateDraftLinks] Processing article ID: ${article.id}`);
            console.log(`[updateDraftLinks] - Original URL: ${draftLink}`);

            // Ensure it's a WordPress site (checking both site_type and platform just in case)
            const siteType = (article.blogs as any)?.site_type?.toLowerCase();
            const platform = (article.blogs as any)?.platform?.toLowerCase();
            
            console.log(`[updateDraftLinks] - site_type: ${siteType}, platform: ${platform}`);
            
            if (siteType !== "wordpress" && platform !== "wordpress") {
                console.log(`[updateDraftLinks] - Skipping: Not a WordPress site.`);
                continue;
            }

            // Pattern: https://example.com/?p=1 to // Pattern: https://example.com/?p=99999999
            const match = draftLink.match(/^(https?:\/\/[^\/]+)\/\?p=(\d+)/);
            if (!match) {
                console.log(`[updateDraftLinks] - Skipping: Regex did not match.`);
                continue;
            }

            const baseUrl = match[1];
            const postId = match[2];
            console.log(`[updateDraftLinks] - Regex matched! BaseUrl: ${baseUrl}, PostID: ${postId}`);

            try {
                // Fetch the published permalink from WordPress REST API
                const apiUrl = `${baseUrl}/wp-json/wp/v2/posts/${postId}`;
                console.log(`[updateDraftLinks] - Fetching from WP API: ${apiUrl}`);
                
                const wpResponse = await fetch(apiUrl, {
                    method: 'GET',
                    headers: { 'Accept': 'application/json' },
                });

                console.log(`[updateDraftLinks] - WP API Status: ${wpResponse.status} ${wpResponse.statusText}`);

                if (wpResponse.ok) {
                    const postData = await wpResponse.json();
                    const liveLink = postData.link;
                    console.log(`[updateDraftLinks] - Extracted liveLink: ${liveLink}`);

                    if (liveLink && liveLink !== draftLink) {
                        // Update Supabase with the new live link
                        console.log(`[updateDraftLinks] - Updating database with new live link...`);
                        const { error: updateError } = await supabase
                            .from("articles")
                            .update({ source_url: liveLink })
                            .eq("id", article.id);

                        if (updateError) {
                            console.error(`[updateDraftLinks] - DB Update Error:`, updateError);
                        } else {
                            console.log(`[updateDraftLinks] - Database updated successfully.`);
                            updateCount++;
                        }
                    } else {
                        console.log(`[updateDraftLinks] - No update needed. liveLink is identical or missing.`);
                    }
                } else {
                    console.error(`[updateDraftLinks] - Failed to resolve WP post ${postId} at ${baseUrl}: ${wpResponse.status} ${wpResponse.statusText}`);
                    // Optionally log response text if debugging 404s/403s
                    const errText = await wpResponse.text();
                    console.error(`[updateDraftLinks] - Response body:`, errText.substring(0, 200));
                }
            } catch (fetchError) {
                console.error(`[updateDraftLinks] - Fetch error resolving WP post ${postId}:`, fetchError);
            }
        }

        return { success: true, count: updateCount };
    } catch (e: any) {
        console.error("Unexpected error in updateWordpressDraftLinksAction:", e);
        return { success: false, error: e.message };
    }
}
