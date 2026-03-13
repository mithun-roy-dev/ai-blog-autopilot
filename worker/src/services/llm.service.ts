import axios from 'axios';
import { SupabaseService } from './supabase.service';

export class LLMService {
    static async completion(options: {
        system: string;
        user: string;
        model?: string;
        json?: boolean;
    }) {
        const supabase = SupabaseService.getClient();
        
        // Fetch OpenRouter Configuration
        const { data: config, error } = await supabase
            .from('ai_configurations')
            .select('*')
            .eq('provider', 'openrouter')
            .single();

        if (error || !config) {
            throw new Error("OpenRouter configuration not found in Admin settings.");
        }

        const model = options.model || config.default_model || 'google/gemini-2.0-flash-001';
        
        console.log(`[LLMService] 🤖 Calling AI model: ${model}...`);

        const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
            model: model,
            messages: [
                { role: 'system', content: options.system },
                { role: 'user', content: options.user }
            ],
            response_format: options.json ? { type: 'json_object' } : undefined
        }, {
            headers: {
                'Authorization': `Bearer ${config.api_key}`,
                'HTTP-Referer': 'https://ai-blog-autopilot.com',
                'X-Title': 'AI Blog Autopilot'
            }
        });

        return response.data.choices[0].message.content;
    }

    static extractJson(text: string) {
        try {
            // Try direct parse first
            return JSON.parse(text);
        } catch (e: any) {
            // Try to extract from markdown backticks
            const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (match && match[1]) {
                try {
                    return JSON.parse(match[1]);
                } catch (e2: any) {
                    throw new Error("Found JSON block but failed to parse it: " + e2.message);
                }
            }
            throw new Error("Failed to parse AI response as JSON.");
        }
    }
}
