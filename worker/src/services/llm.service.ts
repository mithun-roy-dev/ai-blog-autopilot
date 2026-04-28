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
    humanizer: 'humanizer_model',
    seo_schema: 'seo_schema_model',
};

// system_settings key names for provider per task
const TASK_PROVIDER_KEY: Record<string, string> = {
    content_brief: 'content_brief_provider',
    writer: 'writer_provider',
    image_metadata: 'image_metadata_provider',
    feature_image: 'feature_image_provider',
    inbody_image: 'inbody_image_provider',
    humanizer: 'humanizer_provider',
    seo_schema: 'seo_schema_provider',
};

/**
 * Thrown when Kie API returns a transient HTTP 500 (network error / maintenance).
 * executeStep catches this specific type to trigger automatic retry logic.
 */
export class KieApiRetryableError extends Error {
    constructor(message: string, public readonly statusCode = 500) {
        super(message);
        this.name = 'KieApiRetryableError';
    }
}

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

            if (err instanceof KieApiRetryableError) {
                throw err;
            }
            throw new Error(`LLM call failed (${provider}/${model}): ${errMsg.substring(0, 200)}`);
        }
    }

    // --- OpenRouter ---
    private static async callOpenRouter(apiKey: string, model: string, system: string, user: string, json?: boolean, timeout?: number): Promise<string> {
        console.log(`[LLMService] Sending Request to OpenRouter...`);
        try {
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
                    'HTTP-Referer': process.env.SITE_URL || 'https://ai-blog-autopilot.com',
                    'X-Title': 'AI Blog Autopilot'
                },
                timeout
            });
            return response.data.choices[0].message.content;
        } catch (axiosErr: any) {
            const statusCode: number = axiosErr?.response?.status;
            const rawBody = axiosErr?.response?.data;
            const bodyStr = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody || {});

            Logger.error('LLMService [callOpenRouter]', `❌ OpenRouter HTTP ${statusCode} error. Body: ${bodyStr.substring(0, 400)}`);

            // 500 Internal Server Error is considered transient/retryable
            if (statusCode === 500) {
                throw new KieApiRetryableError(`OpenRouter temporarily unavailable (HTTP 500): ${bodyStr.substring(0, 200)}`, 500);
            }

            // All other errors (4xx, 429, etc.) are fatal
            throw new Error(`OpenRouter Error (${statusCode}): ${bodyStr.substring(0, 200)}`);
        }
    }

    // --- Kie API (Anthropic format) ---
    // --- Kie API (Dynamic Format) ---
    private static async callKieApi(apiKey: string, model: string, system: string, user: string, timeout?: number): Promise<string> {
        console.log(`[LLMService] Sending Request to Kie API...`);
        Logger.debug('[LLMService]', ` Kie API Request sending\nmodel:${model}\nsystem:${system}\nuser:${user}`);

        let apiUrl = '';
        let payload: any = {};
        const lowerModel = model.toLowerCase();

        // 1. Claude models
        if (lowerModel.includes('claude')) {
            apiUrl = 'https://api.kie.ai/claude/v1/messages';
            payload = {
                thinkingFlag: true,
                model,
                system,
                messages: [{ role: 'user', content: user }],
                max_tokens: 16384,
                stream: false
            };
        }
        // 2. Special Case: GPT-5.4 (must be checked BEFORE the generic 'gpt' check)
        else if (lowerModel.includes('gpt')) {
            if (lowerModel.includes('gpt-2-2')) {
                apiUrl = `https://api.kie.ai/${model}/v1/chat/completions`;
                payload = {
                    model,
                    messages: [
                        { role: 'system', content: system },
                        { role: 'user', content: user }
                    ],
                    stream: false,
                    include_thoughts: true,
                    reasoning_effort: "high",
                    max_tokens: 16384
                };
            }
            else {
                apiUrl = 'https://api.kie.ai/codex/v1/responses';
                payload = {
                    model,
                    input: [
                        {
                            role: 'system',
                            content: [
                                { type: 'input_text', text: system }
                            ]
                        },
                        {
                            role: 'user',
                            content: [
                                { type: 'input_text', text: user }
                            ]
                        }
                    ],
                    stream: false,
                    reasoning: {
                        effort: "high"
                    },
                    max_output_tokens: 16384
                };
            }
        }
        // 3. Gemini and other GPT models
        else if (lowerModel.includes('gemini')) {
            apiUrl = `https://api.kie.ai/${model}/v1/chat/completions`;
            payload = {
                model,
                messages: [
                    { role: 'system', content: system },
                    { role: 'user', content: user }
                ],
                stream: false,
                include_thoughts: true,
                reasoning_effort: "high",
                max_tokens: 16384
            };
        }
        // 4. Fallback: default to Claude endpoint
        else {
            apiUrl = 'https://api.kie.ai/claude/v1/messages';
            payload = {
                thinkingFlag: true,
                model,
                system,
                messages: [{ role: 'user', content: user }],
                max_tokens: 16384,
                stream: false
            };
        }

        Logger.debug('LLMService [callKieApi]', `Request → url: ${apiUrl}\npayload: ${JSON.stringify(payload, null, 2)}`);

        let response: any;
        try {
            response = await axios.post(apiUrl, payload, {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout
            });
        } catch (axiosErr: any) {
            const statusCode: number = axiosErr?.response?.status;
            const rawBody = axiosErr?.response?.data;
            const bodyStr = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody || {});

            Logger.error('LLMService [callKieApi]', `❌ Kie API HTTP ${statusCode} error. Body: ${bodyStr.substring(0, 400)}`, axiosErr);
            Logger.debug('LLMService [callKieApi]', `Kie API HTTP ${statusCode} error. Body: ${bodyStr.substring(0, 400)}`);
            // Any 500 error is transient and eligible for automatic retry
            if (statusCode === 500) {
                Logger.warn('LLMService [callKieApi]', `⚠️ Kie API retryable 500 detected. Throwing KieApiRetryableError.`);
                throw new KieApiRetryableError(`Kie API temporarily unavailable: ${bodyStr.substring(0, 300)}`, statusCode);
            }
            Logger.debug('LLMService [callKieApi]', `Kie API HTTP ${statusCode} error. Body: ${bodyStr.substring(0, 400)}`);
            // All other HTTP errors (e.g. 400, 401, 402, 429) — fail the job immediately
            const errorMessage = (rawBody && typeof rawBody === 'object' && rawBody.error?.message)
                ? rawBody.error.message
                : bodyStr.substring(0, 200);

            throw new Error(`Kie API Error (${statusCode}): ${errorMessage}`);
        }

        const data = response.data;
        // Properly stringify the response data for debugging
        Logger.debug(`Kie API Response`, `Response: ${typeof data === 'string' ? data : JSON.stringify(data)}`);

        // Detect API-level failures disguised as HTTP 200 OK
        if (data && typeof data === 'object' && data.code !== undefined && data.code !== 200) {
            const errorMsg = data.msg || 'Unknown Kie API JSON error';
            const msgStr = typeof errorMsg === 'string' ? errorMsg : JSON.stringify(errorMsg);
            Logger.debug('LLMService [callKieApi]', `Kie API JSON error. Code: ${data.code}, Message: ${msgStr}`);
            // Any 500 error is transient and eligible for automatic retry
            if (data.code === 500) {
                Logger.warn('LLMService [callKieApi]', `⚠️ Kie API fake-200 retryable 500 detected. Throwing KieApiRetryableError.`);
                Logger.debug('LLMService [callKieApi]-KieApiRetryableError', `Kie API stop job`);
                throw new KieApiRetryableError(`Kie API temporarily unavailable: ${msgStr}`, 500);
                //throw new Error(`Kie API Error (${data.code}): ${msgStr}`);
            }

            // All other non-200 codes (e.g. 400) fail immediately and definitively stop the job.
            throw new Error(`Kie API Error (${data.code}): ${msgStr}`);
        }

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
        // 3. Kie Codex / GPT-5.5 Output Format
        if (data?.output && Array.isArray(data.output)) {
            const message = data.output.find((item: any) => item.type === 'message');
            if (message?.content && Array.isArray(message.content)) {
                const textBlock = message.content.find((block: any) => block.type === 'output_text');
                if (textBlock?.text) {
                    return textBlock.text;
                }
            }
        }

        throw new Error(`[LLMService] Kie API returned unexpected response format. Received: ${typeof data === 'string' ? data.substring(0, 200) : JSON.stringify(data).substring(0, 200)}`);
    }

    // --- Google AI (REST) ---
    private static async callGoogleAI(apiKey: string, model: string, system: string, user: string, timeout?: number): Promise<string> {
        const modelId = model.startsWith('google/') ? model.replace('google/', '') : model;
        const apiBase = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}`;

        console.log(`[LLMService] Sending Request to Google AI (${modelId})...`);

        try {
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
        } catch (axiosErr: any) {
            // If it's the custom "returned no text" error we just threw, rethrow it
            if (axiosErr.message.includes('returned no text')) throw axiosErr;

            const statusCode: number = axiosErr?.response?.status;
            const rawBody = axiosErr?.response?.data;
            const bodyStr = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody || {});

            Logger.error('LLMService [callGoogleAI]', `❌ Google AI HTTP ${statusCode} error. Status: ${statusCode}, Body: ${bodyStr.substring(0, 400)}`);

            // 500 Internal Server Error is considered transient/retryable
            if (statusCode === 500) {
                throw new KieApiRetryableError(`Google AI temporarily unavailable (HTTP 500): ${bodyStr.substring(0, 200)}`, 500);
            }

            // All other errors (4xx, 429, etc.) are fatal
            throw new Error(`Google AI Error (${statusCode}): ${bodyStr.substring(0, 200)}`);
        }
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
