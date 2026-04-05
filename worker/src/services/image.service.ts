import axios from 'axios';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { SupabaseService } from './supabase.service';
import { PromptService } from './prompt.service';
import { Logger } from '../utils/logger';

export interface ImageBlock {
    rawBlock: string;       // Full original "[IMAGE ... ]" string for replacement
    number: number;
    type: 'featured' | 'in-body';
    title: string;
    alt: string;
    caption: string;
    description: string;
}

interface R2Config {
    accountId: string;
    accessKeyId: string;
    secretAccessKey: string;
    bucketName: string;
    publicUrl: string;
}

export class ImageService {

    /**
     * Pure function — extracts all [IMAGE ... ] blocks from article content.
     * No DB calls, no async, safe to call anywhere.
     */
    static extractImagePlaceholders(articleContent: string): ImageBlock[] {
        const blocks: ImageBlock[] = [];

        // Match full [IMAGE ... ] blocks including multiline
        const blockRegex = /\[IMAGE\s*([\s\S]*?)\]/g;
        let match;

        while ((match = blockRegex.exec(articleContent)) !== null) {
            const rawBlock = match[0];
            const blockContent = match[1];

            const getField = (name: string): string => {
                const fieldMatch = blockContent.match(new RegExp(`${name}\\s*:\\s*(.+)`, 'i'));
                return fieldMatch ? fieldMatch[1].trim() : '';
            };

            const numberStr = getField('number');
            const typeStr = getField('type').toLowerCase();

            blocks.push({
                rawBlock,
                number: parseInt(numberStr, 10) || blocks.length + 1,
                type: typeStr === 'featured' ? 'featured' : 'in-body',
                title: getField('title'),
                alt: getField('alt'),
                caption: getField('caption'),
                description: getField('description'),
            });
        }

        return blocks;
    }

    /**
     * Generates image metadata/prompt using the designated metadata prompt slug + LLM.
     * Returns the AI-generated image brief (JSON or text) as a string.
     */
    static async generateImageMetadata(
        block: ImageBlock,
        metadataModel: string,
        openrouterApiKey: string,
        jobId: string
    ): Promise<string> {
        const metadataSlug = block.type === 'featured'
            ? 'featured-image-metadata'
            : 'infographic-image-metadata';

        const promptConfig = await PromptService.getPrompt(metadataSlug);
        if (!promptConfig) {
            throw new Error(`[ImageService] Metadata prompt not found: "${metadataSlug}". Create it in Admin Prompt Setup.`);
        }

        // Serialize the image block into a readable format for injection
        const imageDataText = [
            `number      : ${block.number}`,
            `type        : ${block.type}`,
            `title       : ${block.title}`,
            `alt         : ${block.alt}`,
            `caption     : ${block.caption}`,
            `description : ${block.description}`,
        ].join('\n');

        const userPrompt = PromptService.injectVariables(
            promptConfig.user_prompt_template,
            { 'image-data': imageDataText }
        );

        Logger.debug(`Job:${jobId}`, `IMAGE_METADATA_REQUEST [${block.type}#${block.number}] slug:${metadataSlug} model:${metadataModel}\nSYSTEM:\n${promptConfig.system_prompt}\nUSER:\n${userPrompt}`);

        const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
            model: metadataModel,
            messages: [
                { role: 'system', content: promptConfig.system_prompt },
                { role: 'user', content: userPrompt }
            ]
        }, {
            headers: {
                'Authorization': `Bearer ${openrouterApiKey}`,
                'HTTP-Referer': 'https://ai-blog-autopilot.com',
                'X-Title': 'AI Blog Autopilot'
            }
        });

        const metadataContent = response.data.choices[0].message.content;
        Logger.debug(`Job:${jobId}`, `IMAGE_METADATA_RESPONSE [${block.type}#${block.number}]:\n${metadataContent}`);

        return metadataContent;
    }

    /**
     * Generates an image using the correct AI provider and image-generation prompt.
     *
     * Flow:
     *   - system_prompt  = fetched from the image gen slug (feature-img-01-26-101 etc.)
     *                      with {{site_name}} injected
     *   - user message   = metadataContent (the JSON brief from the metadata step — used DIRECTLY)
     *                      This is the key design: metadata output IS the image generation prompt.
     *
     * Returns raw image bytes as a Buffer.
     */
    static async generateImage(
        metadataContent: string,
        imageType: 'featured' | 'in-body',
        provider: string,
        siteName: string,
        jobId: string
    ): Promise<Buffer> {
        const supabase = SupabaseService.getClient();

        const imageGenSlug = imageType === 'featured'
            ? 'feature-img-01-26-101'
            : 'infographic-image-01-26-101';

        const promptConfig = await PromptService.getPrompt(imageGenSlug);
        if (!promptConfig) {
            throw new Error(`[ImageService] Image gen prompt not found: "${imageGenSlug}". Create it in Admin Prompt Setup.`);
        }

        // system_prompt: fetched from the slug, {{site_name}} injected
        // user_prompt:   fetched from the slug, both {{image-metadata}} AND {{site_name}} injected
        //                This makes metadataContent fill the {{image-metadata}} placeholder,
        //                and the target site fills {{site_name}}.
        const systemPrompt = PromptService.injectVariables(promptConfig.system_prompt, {
            site_name: siteName
        });
        const userMessage = PromptService.injectVariables(promptConfig.user_prompt_template, {
            'image-metadata': metadataContent,
            site_name: siteName
        });

        Logger.debug(`Job:${jobId}`, `IMAGE_GEN_REQUEST [${imageType}] provider:${provider} slug:${imageGenSlug}\nSYSTEM:\n${systemPrompt}\nUSER (metadata output as prompt):\n${userMessage}`);

        if (provider === 'openrouter') {
            const { data: orConfig } = await supabase
                .from('ai_configurations')
                .select('api_key, image_model_1')
                .eq('provider', 'openrouter')
                .single();

            if (!orConfig?.api_key) throw new Error('[ImageService] OpenRouter API key not found.');

            const imageModel = orConfig.image_model_1 || 'openai/gpt-image-1';

            const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
                model: imageModel,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage }
                ]
            }, {
                headers: {
                    'Authorization': `Bearer ${orConfig.api_key}`,
                    'HTTP-Referer': 'https://ai-blog-autopilot.com',
                    'X-Title': 'AI Blog Autopilot'
                }
            });

            Logger.debug(`Job:${jobId}`, `IMAGE_GEN_RAW_RESPONSE [${imageType}]: ${JSON.stringify(response.data?.choices?.[0]?.message).substring(0, 600)}`);

            // Handle all known OpenRouter image response formats
            const result = await ImageService.extractImageFromResponse(response.data, jobId, imageType);
            if (result) return result;

            throw new Error(`[ImageService] Could not extract image from OpenRouter response. Raw message: ${JSON.stringify(response.data?.choices?.[0]?.message).substring(0, 400)}`);

        } else if (provider === 'google') {
            const { data: googleConfig } = await supabase
                .from('ai_configurations')
                .select('api_key, image_model_1')
                .eq('provider', 'google')
                .single();

            if (!googleConfig?.api_key) throw new Error('[ImageService] Google API key not found in Site Setup.');

            // "Text to Image Model" field from Google AI provider config
            const rawModel = googleConfig.image_model_1 || 'imagen-3.0-generate-001';

            // Strip OpenRouter-style "google/" prefix — Google's own API uses bare model IDs
            // e.g. "google/gemini-3-pro-image-preview" → "gemini-3-pro-image-preview"
            const imageModel = rawModel.startsWith('google/') ? rawModel.replace('google/', '') : rawModel;

            Logger.debug(`Job:${jobId}`, `IMAGE_GEN_REQUEST [Google] rawModel="${rawModel}" → resolvedModel="${imageModel}"`);

            const prompt = `${systemPrompt}\n\n${userMessage}`;
            const apiBase = `https://generativelanguage.googleapis.com/v1beta/models/${imageModel}`;

            let response: any;

            if (imageModel.startsWith('imagen-')) {
                // ── Imagen models: use :predict endpoint ─────────────────────
                Logger.debug(`Job:${jobId}`, `IMAGE_GEN_REQUEST [Imagen/${imageModel}]: using :predict endpoint`);
                response = await axios.post(
                    `${apiBase}:predict?key=${googleConfig.api_key}`,
                    { instances: [{ prompt }], parameters: { sampleCount: 1 } },
                    { headers: { 'Content-Type': 'application/json' } }
                );
                Logger.debug(`Job:${jobId}`, `IMAGE_GEN_RAW_RESPONSE [Imagen/${imageModel}]: ${JSON.stringify(response.data).substring(0, 400)}`);

                const base64 = response.data?.predictions?.[0]?.bytesBase64Encoded;
                if (base64) {
                    Logger.debug(`Job:${jobId}`, `IMAGE_GEN_RESPONSE [Imagen/${imageModel}]: image received`);
                    return Buffer.from(base64, 'base64');
                }

            } else {
                // ── Gemini image models: use :generateContent endpoint ────────
                Logger.debug(`Job:${jobId}`, `IMAGE_GEN_REQUEST [Gemini/${imageModel}]: using :generateContent endpoint`);
                response = await axios.post(
                    `${apiBase}:generateContent?key=${googleConfig.api_key}`,
                    {
                        contents: [{ parts: [{ text: prompt }] }],
                        generationConfig: { responseModalities: ['IMAGE', 'TEXT'] }
                    },
                    { headers: { 'Content-Type': 'application/json' } }
                );
                Logger.debug(`Job:${jobId}`, `IMAGE_GEN_RAW_RESPONSE [Gemini/${imageModel}]: ${JSON.stringify(response.data).substring(0, 400)}`);

                const parts = response.data?.candidates?.[0]?.content?.parts || [];
                for (const part of parts) {
                    if (part?.inlineData?.data) {
                        Logger.debug(`Job:${jobId}`, `IMAGE_GEN_RESPONSE [Gemini/${imageModel}]: image received via inlineData`);
                        return Buffer.from(part.inlineData.data, 'base64');
                    }
                }
            }

            throw new Error(`[ImageService] Google AI (${imageModel}) returned no image data. Response: ${JSON.stringify(response?.data).substring(0, 300)}`);


        } else {
            throw new Error(`[ImageService] Unsupported image provider: "${provider}". Use OpenRouter or Google.`);
        }
    }

    /**
     * Extracts image Buffer from an OpenRouter (or OpenAI-compatible) response.
     *
     * Handles all known formats:
     *   Format A: content string → base64 data URI / URL / raw base64
     *   Format B: content array  → part.type=image_url with data URI or URL
     *   Format C: OpenAI style   → data[0].b64_json or data[0].url
     */
    private static async extractImageFromResponse(
        responseData: any,
        jobId: string,
        imageType: string
    ): Promise<Buffer | null> {
        const message = responseData?.choices?.[0]?.message;

        // ── Format A: string content ──────────────────────────────────────────
        if (typeof message?.content === 'string' && message.content.length > 0) {
            const content: string = message.content;

            // A1: inline base64 data URI
            const b64UriMatch = content.match(/data:image\/[a-z]+;base64,([A-Za-z0-9+/=]+)/);
            if (b64UriMatch) {
                Logger.debug(`Job:${jobId}`, `IMAGE_GEN_RESPONSE [${imageType}]: Format A1 — base64 data URI`);
                return Buffer.from(b64UriMatch[1], 'base64');
            }

            // A2: URL in content text — download the image
            const urlMatch = content.match(/https?:\/\/[^\s"'<>]+/i);
            if (urlMatch) {
                Logger.debug(`Job:${jobId}`, `IMAGE_GEN_RESPONSE [${imageType}]: Format A2 — URL: ${urlMatch[0]}`);
                const imgResp = await axios.get(urlMatch[0], { responseType: 'arraybuffer' });
                return Buffer.from(imgResp.data);
            }

            // A3: raw base64 string (long, no prefix)
            if (/^[A-Za-z0-9+/=]{200,}$/.test(content.trim())) {
                Logger.debug(`Job:${jobId}`, `IMAGE_GEN_RESPONSE [${imageType}]: Format A3 — raw base64`);
                return Buffer.from(content.trim(), 'base64');
            }
        }

        // ── Format B: content is an array of content parts (multi-modal) ─────
        const contentParts = Array.isArray(message?.content) ? message.content : [];
        for (const part of contentParts) {
            if (part?.type === 'image_url' && part?.image_url?.url) {
                const url: string = part.image_url.url;
                if (url.startsWith('data:image/')) {
                    Logger.debug(`Job:${jobId}`, `IMAGE_GEN_RESPONSE [${imageType}]: Format B — base64 in content[].image_url`);
                    return Buffer.from(url.split(',')[1], 'base64');
                }
                Logger.debug(`Job:${jobId}`, `IMAGE_GEN_RESPONSE [${imageType}]: Format B — URL in content[].image_url: ${url}`);
                const imgResp = await axios.get(url, { responseType: 'arraybuffer' });
                return Buffer.from(imgResp.data);
            }
        }

        // ── Format C: OpenAI-style top-level data array ───────────────────────
        if (responseData?.data?.[0]?.b64_json) {
            Logger.debug(`Job:${jobId}`, `IMAGE_GEN_RESPONSE [${imageType}]: Format C — b64_json`);
            return Buffer.from(responseData.data[0].b64_json, 'base64');
        }
        if (responseData?.data?.[0]?.url) {
            Logger.debug(`Job:${jobId}`, `IMAGE_GEN_RESPONSE [${imageType}]: Format C — URL: ${responseData.data[0].url}`);
            const imgResp = await axios.get(responseData.data[0].url, { responseType: 'arraybuffer' });
            return Buffer.from(imgResp.data);
        }

        return null;
    }

    /**
     * Uploads an image buffer to Cloudflare R2 and returns the public URL.
     */
    static async uploadToR2(
        imageBuffer: Buffer,
        r2Key: string,
        r2Config: R2Config,
        jobId: string
    ): Promise<string> {
        const endpoint = `https://${r2Config.accountId}.r2.cloudflarestorage.com`;

        const s3 = new S3Client({
            region: 'auto',
            endpoint,
            credentials: {
                accessKeyId: r2Config.accessKeyId,
                secretAccessKey: r2Config.secretAccessKey,
            }
        });

        const contentType = r2Key.endsWith('.png') ? 'image/png' : 'image/jpeg';

        Logger.debug(`Job:${jobId}`, `R2_UPLOAD_REQUEST: bucket=${r2Config.bucketName} key=${r2Key}`);

        await s3.send(new PutObjectCommand({
            Bucket: r2Config.bucketName,
            Key: r2Key,
            Body: imageBuffer,
            ContentType: contentType,
        }));

        // Build the public URL
        const publicBase = r2Config.publicUrl.replace(/\/$/, '');
        const publicUrl = `${publicBase}/${r2Key}`;

        Logger.debug(`Job:${jobId}`, `R2_UPLOAD_SUCCESS: ${publicUrl}`);

        return publicUrl;
    }

    /**
     * Parses the R2 config JSON stored in the api_key field of ai_configurations.
     */
    static parseR2Config(apiKeyValue: string): R2Config {
        try {
            const config = JSON.parse(apiKeyValue);
            if (!config.accountId || !config.accessKeyId || !config.secretAccessKey || !config.bucketName) {
                throw new Error('Missing required R2 fields: accountId, accessKeyId, secretAccessKey, bucketName');
            }
            return config as R2Config;
        } catch (e: any) {
            throw new Error(`[ImageService] Invalid Cloudflare R2 configuration: ${e.message}`);
        }
    }

    /**
     * Formats the replacement HTML for an image block.
     */
    static formatImageHtml(block: ImageBlock, imageUrl: string): string {
        return `<figure>\n  <img src="${imageUrl}" alt="${block.alt}" title="${block.title}">\n  <figcaption>${block.caption}</figcaption>\n</figure>`;
    }
}
