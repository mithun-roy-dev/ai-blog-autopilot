import axios from 'axios';
import { SupabaseService } from './supabase.service';
import { Logger } from '../utils/logger';

// Task column names in ai_configurations, keyed by taskRef
const TASK_MODEL_COLUMN: Record<string, string> = {
    content_brief: 'content_brief_model',
    writer: 'writer_model',
    image_metadata: 'image_metadata_model',
    feature_image: 'feature_image_model',
    inbody_image: 'inbody_image_model',
};

// system_settings key names for provider per task
const TASK_PROVIDER_KEY: Record<string, string> = {
    content_brief: 'content_brief_provider',
    writer: 'writer_provider',
    image_metadata: 'image_metadata_provider',
    feature_image: 'feature_image_provider',
    inbody_image: 'inbody_image_provider',
};

export class LLMService {
    /**
     * Resolves the provider and model for a given taskRef from system_settings and ai_configurations.
     */
    static async resolveTask(taskRef: string): Promise<{ provider: string; model: string; apiKey: string }> {
        console.log(`[LLMService] resolveTask starting for "${taskRef}"...`);
        Logger.debug('LLMService', `resolveTask starting for "${taskRef}"...`);

        try {
            const supabase = SupabaseService.getClient();
            const providerKey = TASK_PROVIDER_KEY[taskRef];
            if (!providerKey) throw new Error(`[LLMService] Unknown taskRef: "${taskRef}"`);

            // 1. Determine provider from system_settings
            console.log(`[LLMService] Fetching system_settings for key="logging_config"...`);
            const { data: sysData, error: sysError } = await supabase
                .from('system_settings')
                .select('value')
                .eq('key', 'logging_config')
                .single();

            if (sysError) {
                console.warn(`[LLMService] resolveTask: Failed to read system_settings: ${sysError.message}`);
                Logger.warn('LLMService', `resolveTask: Failed to read system_settings for "${taskRef}": ${sysError.message}. Defaulting to openrouter.`);
            }

            const rawSettingsValue = sysData?.value;
            const provider: string = rawSettingsValue?.[providerKey] || 'openrouter';

            // 2. Fetch the model and api_key from ai_configurations for that provider
            const modelColumn = TASK_MODEL_COLUMN[taskRef];

            console.log(`[LLMService] Fetching ai_configurations for provider="${provider}"...`);
            const { data: config, error: configError } = await supabase
                .from('ai_configurations')
                .select(`api_key, ${modelColumn}`)
                .eq('provider', provider)
                .single();

            if (configError || !config) {
                throw new Error(`[LLMService] No ai_configurations row found for provider "${provider}". Please configure it in Admin > Site Setup.`);
            }

            const model: string = (config as any)[modelColumn] || 'google/gemini-2.0-flash-001';
            const apiKey: string = (config as any).api_key || '';

            if (!apiKey) {
                throw new Error(`[LLMService] API key not set for provider "${provider}".`);
            }

            console.log(`[LLMService] ✅ Resolved "${taskRef}" -> "${provider}" / "${model}"`);
            Logger.info('LLMService', `✅ Resolved taskRef="${taskRef}" → provider="${provider}", model="${model}"`);

            return { provider, model, apiKey };
        } catch (err: any) {
            console.error(`[LLMService] resolveTask CRITICAL ERROR: ${err.message}`);
            Logger.error('LLMService', `resolveTask CRITICAL ERROR: ${err.message}`, err);
            throw err;
        }
    }

    static async completion(options: {
        system: string;
        user: string;
        model?: string;
        provider?: string;
        taskRef?: string;
        json?: boolean;
    }): Promise<string> {
        console.log(`[LLMService] completion() called with taskRef="${options.taskRef}"`);
        Logger.debug('LLMService', `completion() called | taskRef="${options.taskRef}" model="${options.model}" provider="${options.provider}" (len: sys=${options.system?.length}, user=${options.user?.length})`);

        let provider = options.provider;
        let model = options.model;
        let apiKey = '';

        try {
            // Resolve if taskRef is given
            if (options.taskRef && !model && !provider) {
                const resolved = await this.resolveTask(options.taskRef);
                provider = resolved.provider;
                model = resolved.model;
                apiKey = resolved.apiKey;
            } else if (provider && model) {
                const supabase = SupabaseService.getClient();
                const { data: config } = await supabase
                    .from('ai_configurations')
                    .select('api_key')
                    .eq('provider', provider)
                    .single();
                apiKey = config?.api_key || '';
            }

            // Fallbacks
            if (!provider) provider = 'openrouter';
            if (!model) {
                console.log(`[LLMService] No model found, falling back to openrouter default...`);
                const supabase = SupabaseService.getClient();
                const { data: config } = await supabase
                    .from('ai_configurations')
                    .select('api_key, writer_model')
                    .eq('provider', 'openrouter')
                    .single();
                model = config?.writer_model || 'google/gemini-2.0-flash-001';
                apiKey = config?.api_key || '';
            }

            console.log(`[LLMService] 🤖 Dispatching to ${provider} (${model})...`);
            Logger.info('LLMService', `🤖 Dispatching to provider="${provider}" model="${model}"...`);

            let result: string;
            const timeout = 120000; // 120s

            if (provider === 'openrouter') {
                result = await this.callOpenRouter(apiKey, model, options.system, options.user, options.json, timeout);
            } else if (provider === 'kie_api') {
                result = await this.callKieApi(apiKey, model, options.system, options.user, timeout);
            } else if (provider === 'google') {
                result = await this.callGoogleAI(apiKey, model, options.system, options.user, timeout);
            } else {
                throw new Error(`[LLMService] Unsupported provider: "${provider}"`);
            }

            console.log(`[LLMService] ✅ Response received (${result.length} chars)`);
            Logger.debug('LLMService', `✅ Response received from provider="${provider}" model="${model}" | length=${result?.length}`);
            return result;

        } catch (err: any) {
            const errMsg = err?.response?.data 
                ? (typeof err.response.data === 'string' ? err.response.data : JSON.stringify(err.response.data)) 
                : err.message;
            
            console.error(`[LLMService] ❌ Error: ${errMsg.substring(0, 500)}`);
            Logger.error('LLMService', `❌ LLM Error | provider="${provider}" model="${model}" | ${errMsg.substring(0, 500)}`, err);
            throw new Error(`LLM call failed (${provider}/${model}): ${errMsg.substring(0, 200)}`);
        }
    }

    // --- OpenRouter ---
    private static async callOpenRouter(apiKey: string, model: string, system: string, user: string, json?: boolean, timeout?: number): Promise<string> {
        console.log(`[LLMService] Sending Request to OpenRouter...`);
        const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
            model,
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: user }
            ],
            response_format: json ? { type: 'json_object' } : undefined
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': 'https://ai-blog-autopilot.com',
                'X-Title': 'AI Blog Autopilot'
            },
            timeout
        });
        return response.data.choices[0].message.content;
    }

    // --- Kie API (Anthropic format) ---
    private static async callKieApi(apiKey: string, model: string, system: string, user: string, timeout?: number): Promise<string> {
        console.log(`[LLMService] Sending Request to Kie API...`);
        const response = await axios.post('https://api.kie.ai/claude/v1/messages', {
            model,
            system,
            messages: [{ role: 'user', content: user }],
            max_tokens: 4096,
            stream: false
        }, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout
        });

        const content = response.data?.content;
        if (Array.isArray(content) && content.length > 0) {
            return content[0].text || '';
        }
        throw new Error(`[LLMService] Kie API returned unexpected response format.`);
    }

    // --- Google AI (REST) ---
    private static async callGoogleAI(apiKey: string, model: string, system: string, user: string, timeout?: number): Promise<string> {
        const modelId = model.startsWith('google/') ? model.replace('google/', '') : model;
        const apiBase = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}`;
        
        console.log(`[LLMService] Sending Request to Google AI (${modelId})...`);

        const response = await axios.post(
            `${apiBase}:generateContent?key=${apiKey}`,
            {
                system_instruction: { parts: [{ text: system }] },
                contents: [{ role: 'user', parts: [{ text: user }] }]
            },
            { 
                headers: { 'Content-Type': 'application/json' },
                timeout
            }
        );

        const parts = response.data?.candidates?.[0]?.content?.parts || [];
        for (const part of parts) {
            if (part?.text) return part.text;
        }
        throw new Error(`[LLMService] Google AI returned no text.`);
    }

    static extractJson(text: string) {
        try {
            return JSON.parse(text);
        } catch (e: any) {
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
