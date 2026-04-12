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
                Logger.debug('LLMService', `resolveTask: Failed to read system_settings for "${taskRef}": ${sysError.message}. Defaulting to openrouter.`);
            }

            const rawSettingsValue = sysData?.value;
            const provider: string = rawSettingsValue?.[providerKey] || 'openrouter';

            // 2. Fetch the model and api_key from ai_configurations for that provider
            const modelColumn = TASK_MODEL_COLUMN[taskRef];

            console.log(`[LLMService] Fetching ai_configurations for provider="${provider}"...`);
            Logger.debug('LLMService', 'Fetching ai_configurations for provider="' + provider + '"...');
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
                    .select('api_key, content_brief_model')
                    .eq('provider', 'openrouter')
                    .single();
                model = config?.content_brief_model || 'google/gemini-2.0-flash-001';
                apiKey = config?.api_key || '';
            }

            console.log(`[LLMService] 🤖 Dispatching to ${provider} (${model})...`);
            Logger.info('LLMService', `🤖 Dispatching to provider="${provider}" model="${model}"...`);
            Logger.debug('LLMService', 'Dispatching to provider="' + provider + '" model="' + model + '"...');

            let result: string;
            const timeout = 300000; // 300s

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
    // --- Kie API (Dynamic Format) ---
    private static async callKieApi(apiKey: string, model: string, system: string, user: string, timeout?: number): Promise<string> {
        console.log(`[LLMService] Sending Request to Kie API...`);
        Logger.debug('[LLMService]', ` Kie API Request sending\nmodel:${model}\nsystem:${system}\nuser:${user}`);

        let apiUrl = '';
        let payload: any = {};
        const lowerModel = model.toLowerCase();

        // 1. Claude Default
        if (lowerModel.includes('claude')) {
            apiUrl = 'https://api.kie.ai/claude/v1/messages';
            payload = {
                model,
                system,
                messages: [{ role: 'user', content: user }],
                max_tokens: 16384,
                stream: false
            };
        }
        // 2. Gemini and other GPT Models
        else if (lowerModel.includes('gemini') || lowerModel.includes('gpt')) {
            apiUrl = `https://api.kie.ai/${model}/v1/chat/completions`;
            payload = {
                model,
                messages: [
                    { role: 'system', content: system },
                    { role: 'user', content: user }
                ],
                stream: false,
                include_thoughts: true,
                reasoning_effort: "high"
            };
        }
        // 3. Special Case: GPT-5.4
        else if (lowerModel.includes('gpt-5.4') || lowerModel.includes('gpt-5-4')) {
            apiUrl = 'https://api.kie.ai/codex/v1/responses';
            payload = {
                model,
                messages: [
                    { role: 'system', content: system },
                    { role: 'user', content: user }
                ],
                stream: false,
                include_thoughts: true,
                reasoning_effort: "high"
            };
        }
        // 4. Claude Default
        else {
            apiUrl = 'https://api.kie.ai/claude/v1/messages';
            payload = {
                model,
                system,
                messages: [{ role: 'user', content: user }],
                max_tokens: 16384,
                stream: false
            };
        }

        const response = await axios.post(apiUrl, payload, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json'
            },
            timeout
        });

        const data = response.data;
        // Properly stringify the response data for debugging
        Logger.debug(`Kie API Response`, `Response: ${typeof data === 'string' ? data : JSON.stringify(data)}`);

        // If stream is true, data might be a raw string of SSE (Server-Sent Events) starting with 'data: '
        if (typeof data === 'string' && data.includes('data: ')) {
            // Very basic SSE aggregation for complete text
            try {
                const chunks = data.split('\n\n').filter(chunk => chunk.startsWith('data: ') && !chunk.includes('[DONE]'));
                const parsedChunks = chunks.map(chunk => JSON.parse(chunk.replace('data: ', '').trim()));
                const fullText = parsedChunks.map(c => c.choices?.[0]?.delta?.content || c.choices?.[0]?.message?.content || '').join('');
                if (fullText) return fullText;
            } catch (sseErr: any) {
                Logger.warn('LLMService', `Failed to parse SSE chunks: ${sseErr.message}`);
            }
        }

        // 1. Anthropic Format Check
        if (data?.content && Array.isArray(data.content)) {
            const textBlock = data.content.find((block: any) => block.text);
            if (textBlock) {
                return textBlock.text;
            }
        }

        // 2. OpenAI Format Fallback Check
        if (data?.choices && Array.isArray(data.choices) && data.choices.length > 0) {
            const msg = data.choices[0].message;
            if (msg && msg.content) {
                return msg.content;
            }
        }

        throw new Error(`[LLMService] Kie API returned unexpected response format. Received: ${typeof data === 'string' ? data.substring(0, 200) : JSON.stringify(data).substring(0, 200)}`);
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
