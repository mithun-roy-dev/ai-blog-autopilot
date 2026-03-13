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
    private static TTL = 5 * 60 * 1000; // 5 minutes

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
