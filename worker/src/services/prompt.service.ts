import { SupabaseService } from './supabase.service';

interface Prompt {
    id: string;
    slug: string;
    name: string;
    system_prompt: string;
    user_prompt_template: string;
    variables: string[];
}

export class PromptService {
    private static cache: Map<string, { prompt: Prompt; expires: number }> = new Map();
    private static TTL = 60 * 60 * 1000; // 1 hour — prompts change rarely, safe to cache longer

    static async getPrompt(slug: string): Promise<Prompt | null> {
        const now = Date.now();
        const cached = this.cache.get(slug);

        if (cached && cached.expires > now) {
            return cached.prompt;
        }

        const supabase = SupabaseService.getClient();
        const { data, error } = await supabase
            .from('ai_prompts')
            .select('*')
            .eq('slug', slug)
            .eq('is_published', true)
            .single();

        if (error || !data) {
            console.warn(`[PromptService] ⚠️ Prompt not found for slug: ${slug}. Falling back to defaults.`);
            return null;
        }

        const prompt: Prompt = data;
        this.cache.set(slug, { prompt, expires: now + this.TTL });
        return prompt;
    }

    /**
     * Evicts one slug (or the entire cache) so the next call re-fetches from DB.
     * Call this from the API route whenever a prompt is saved in site-setup,
     * so the worker picks up changes immediately without waiting for the 1-hour TTL.
     */
    static clearCache(slug?: string): void {
        if (slug) {
            this.cache.delete(slug);
            console.log(`[PromptService] 🗑️ Cache cleared for slug: "${slug}"`);
        } else {
            this.cache.clear();
            console.log('[PromptService] 🗑️ Full prompt cache cleared');
        }
    }

    /**
     * Replaces {{variable}} placeholders in a string
     */
    static injectVariables(template: string, variables: Record<string, string>): string {
        let result = template;
        for (const [key, value] of Object.entries(variables)) {
            const regex = new RegExp(`{{${key}}}`, 'g');
            result = result.replace(regex, value || '');
        }
        return result;
    }
}
