"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Settings, Shield, Save, Loader2, AlertCircle, CheckCircle2, Cpu, Globe, Zap, Key, Search, Terminal, Bot, Database, Image as ImageIcon, Edit } from "lucide-react"
import { createClient } from "@/utils/supabase/client"
import { toast } from "sonner"
import { cn } from "@/utils/cn"

const PROVIDERS = [
    { id: "openrouter", name: "OpenRouter", icon: Globe, description: "Access OpenAI, Anthropic, Google and deepseek via a single API." },
    { id: "openai", name: "OpenAI", icon: Zap, description: "Direct access to GPT-4o, GPT-3.5-Turbo and more." },
    { id: "claude", name: "Claude (Anthropic)", icon: Cpu, description: "High-performance AI with advanced reasoning." },
    { id: "google", name: "Google AI", icon: Bot, description: "Direct access to Gemini and Imagen models." },
    { id: "kie_api", name: "Kie API", icon: Zap, description: "Kie API featuring Seedream, Nano Banana and Wan Image models." },
    { id: "serpapi", name: "SerpAPI", icon: Search, description: "Google Search results for content research and analysis." },
    { id: "serp_crawl_setup", name: "Crawl Setup", icon: Globe, description: "Configure SERP analysis extraction limits." },
    { id: "prompt_setup", name: "Prompt Setup", icon: Terminal, description: "Manage and refine AI instructions dynamically." },
    { id: "image_templates", name: "Image Template Setup", icon: ImageIcon, description: "Select visual prompts used for featured and in-body images." },
    { id: "editor_setup", name: "Editor Setup", icon: Edit, description: "Configure AI editing behavior and manual review flows." },
    { id: "publishing_setup", name: "Publishing Setup", icon: Globe, description: "Configure automated scheduling and WordPress publishing rules." },
    { id: "system_ops", name: "System Setup", icon: Shield, description: "Manage global application settings and operational toggles." },
    { id: "cloudflare_r2", name: "Cloudflare R2", icon: Database, description: "Configure API credentials for Cloudflare R2 object storage." },
]

const OPENROUTER_MODELS = [
    { id: "google/gemini-3-flash-preview", name: "Gemini 3 Flash Preview" },
    { id: "google/gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite" },
    { id: "anthropic/claude-sonnet-4.6", name: "Claude Sonnet 4.6" },
    { id: "google/gemma-3-27b-it:free", name: "Gemma 3 27B IT (Free)" },
    { id: "openai/gpt-oss-120b:free", name: "GPT-OSS 120B (Free)" },
    { id: "openai/gpt-5.4", name: "GPT 5.4" },
    { id: "arcee-ai/trinity-large-preview:free", name: "Trinity Large Preview (Free)" },
    { id: "google/gemini-2.0-flash-001", name: "Gemini 2.0 Flash" },
    { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet" },
    { id: "deepseek/deepseek-r1", name: "DeepSeek r1" },
    { id: "deepseek/deepseek-v3.2", name: "DeepSeek V3.2" },
    { id: "deepseek/deepseek-chat", name: "DeepSeek Chat" },
    { id: "openai/gpt-4o", name: "GPT-4o" },
    { id: "anthropic/claude-opus-4.6", name: "Claude Opus 4.6" },
    { id: "anthropic/claude-opus-4.5", name: "Claude Opus 4.5" },
    { id: "anthropic/claude-haiku-4.5", name: "Claude Haiku 4.5" },
    { id: "stepfun/step-3.5-flash:free", name: "Stepfun-3.5 flash:free" },
    { id: "google/gemini-3-pro-image-preview", name: "Gemini 3 Nano Banana Pro" },
    { id: "google/gemini-3.1-flash-image-preview", name: "Gemini 3.1 Flash Na Banana 2" },
    { id: "openai/gpt-5-image-mini", name: "GPT 5 Image Mini" },
    { id: "minimax/minimax-m2.7", name: "Minimax M2-2.7" },
    { id: "minimax/minimax-m2.5", name: "Minimax M2-2.5" },
    { id: "minimax/minimax-m2.5:free", name: "Minimax M2-2.5 free" },
    { id: "mistralai/mistral-nemo", name: "Mistral Nemo" },
    { id: "google/gemma-4-26b-a4b-it", name: "Gemma 4 26B A4B IT" },
    { id: "meta-llama/llama-3.1-70b-instruct", name: "Llama 3.1 70B" },
]

const GOOGLE_LLM_MODELS = [
    { id: "gemini-2.0-flash-exp", name: "Gemini 2.0 Flash Exp" },
    { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro" },
    { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash" },
]

const GOOGLE_IMAGE_MODELS = [
    { id: "imagen-3.0-generate-001", name: "Imagen 3.0 Generate" },
    { id: "google/gemini-3-pro-image-preview", name: "Gemini 3 Nano Banana Pro" },
    { id: "google/gemini-3.1-flash-image-preview", name: "Gemini 3.1 Flash Na Banana 2" },
]

const KIE_IMAGE_MODELS = [
    { id: "bytedance/seedream-v4-text-to-image", name: "Seedream 4.0" },
    { id: "seedream/4.5-text-to-image", name: "Seedream 4.5" },
    { id: "nano-banana-2", name: "Nano Banana 2" },
    { id: "google/nano-banana", name: "Nano Banana" },
    { id: "nano-banana-pro", name: "Nano Banana Pro" },
    { id: "grok-imagine/text-to-image", name: "Grok Imagine" },
    { id: "google/imagen4-fast", name: "Google Imagen 4 Fast" },
    { id: "wan/2-7-image", name: "Wan Image" },
]

const KIE_LLM_MODELS = [
    { id: "claude-opus-4-5", name: "Claude Opus 4.5" },
    { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5" },
    { id: "claude-opus-4-6", name: "Claude Opus 4.6" },
    { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6" },
    { id: "claude-haiku-4-5", name: "Claude Haiku 4.5" },
    { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro" },
    { id: "gemini-3-pro", name: "Gemini 3 Pro" },
    { id: "gemini-3.1-pro", name: "Gemini 3.1 Pro" },
    { id: "gemini-3-flash", name: "Gemini 3 Flash" },
    { id: "gpt-5-2", name: "GPT 5.2" },
    { id: "gpt-5-4", name: "GPT 5.4" },
]

export default function SiteSetupPage() {
    const supabase = createClient()
    const router = useRouter()

    const [userEmail, setUserEmail] = useState<string | null>(null)
    const [configs, setConfigs] = useState<any[]>([])
    const [blogs, setBlogs] = useState<any[]>([])
    const [selectedBlogId, setSelectedBlogId] = useState<string>("")
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [selectedProvider, setSelectedProvider] = useState("openrouter")

    const SelectedProviderIcon = PROVIDERS.find(p => p.id === selectedProvider)?.icon || Shield

    // Form State - only api_key; models are managed in System Setup
    const [formData, setFormData] = useState({
        api_key: ""
    })

    // System Settings State
    const [systemSettings, setSystemSettings] = useState({
        enable_debug: true,
        enable_error: true,
        auto_edit: false,
        content_brief_provider: "kie_api",
        content_brief_model: "claude-haiku-4-5",
        writer_provider: "kie_api",
        writer_model: "claude-haiku-4-5",
        image_metadata_provider: "kie_api",
        image_metadata_model: "claude-haiku-4-5",
        feature_image_provider: "kie_api",
        feature_image_model: "bytedance/seedream-v4-text-to-image",
        inbody_image_provider: "kie_api",
        inbody_image_model: "bytedance/seedream-v4-text-to-image",
        humanizer_provider: "kie_api",
        humanizer_model: "claude-haiku-4-5",
        seo_schema_provider: "kie_api",
        seo_schema_model: "claude-haiku-4-5",
        seo_schema_prompt: "",
        image_featured_width: 1200,
        image_featured_height: 630,
        image_featured_format: "webp",
        image_featured_quality: 85,
        image_inbody_width: 500,
        image_inbody_height: 1000,
        image_inbody_format: "webp",
        image_inbody_quality: 85,
        feature_image_prompt: "feature-img-01-26-101",
        inbody_image_prompt: "infographic-image-01-26-101"
    })

    // Publishing Settings State
    const [publishingSettings, setPublishingSettings] = useState({
        auto_publish: false,
        publish_save_status: "draft",
        schedule_active: false,
        frequency: "daily",
        times_per_period: 1,
        schedule_logic: "spread_evenly",
        start_time: "09:00",
        enable_rankmath_metadata: false,
        enable_seo_schema_generation: false,
        max_article_tags: 0
    })

    // Crawl Setup State
    const [serpCrawlSettings, setSerpCrawlSettings] = useState({
        max_h2: 30,
        max_h3: 30,
        max_h4: 20,
        max_h5: 2,
        max_h6: 2
    })

    const [selectedBlog, setSelectedBlog] = useState<any>(null)
    useEffect(() => {
        if (selectedBlogId) {
            setSelectedBlog(blogs.find(b => b.id === selectedBlogId))
        }
    }, [selectedBlogId, blogs])

    // Prompt State
    const [prompts, setPrompts] = useState<any[]>([])
    const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null)
    const [promptFormData, setPromptFormData] = useState({
        name: "",
        slug: "",
        system_prompt: "",
        user_prompt_template: "",
        variables: "[]",
        mockup_image_url: "",
        is_published: true
    })

    useEffect(() => {
        checkAuth()
    }, [])

    const checkAuth = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || user.email !== "mithunroyabir@gmail.com") {
            toast.error("Unauthorized access")
            router.push("/dashboard")
            return
        }
        setUserEmail(user.email)
        refreshData()
    }

    const refreshData = () => {
        fetchConfigs()
        fetchBlogs()
        fetchPrompts()
        if (selectedBlogId) fetchPublishingSettings(selectedBlogId)
    }

    const fetchBlogs = async () => {
        const { data } = await supabase.from("blogs").select("id, name, url, wp_username, author_name, author_url").order("name")
        setBlogs(data || [])
        if (data && data.length > 0 && !selectedBlogId) {
            setSelectedBlogId(data[0].id)
        }
    }

    const fetchPublishingSettings = async (blogId: string) => {
        try {
            const { data, error } = await supabase
                .from("blog_publishing_settings")
                .select("*")
                .eq("blog_id", blogId)
                .maybeSingle()

            if (data) {
                setPublishingSettings({
                    auto_publish: data.auto_publish,
                    publish_save_status: data.publish_save_status,
                    schedule_active: data.schedule_active,
                    frequency: data.frequency,
                    times_per_period: data.times_per_period,
                    schedule_logic: data.schedule_logic,
                    start_time: data.start_time?.substring(0, 5) || "09:00",
                    enable_rankmath_metadata: data.enable_rankmath_metadata ?? false,
                    enable_seo_schema_generation: data.enable_seo_schema_generation ?? false,
                    max_article_tags: data.max_article_tags ?? 0
                })
            } else {
                setPublishingSettings({
                    auto_publish: false,
                    publish_save_status: "draft",
                    schedule_active: false,
                    frequency: "daily",
                    times_per_period: 1,
                    schedule_logic: "spread_evenly",
                    start_time: "09:00",
                    enable_rankmath_metadata: false,
                    enable_seo_schema_generation: false,
                    max_article_tags: 0
                })
            }
        } catch (err) {
            console.error("Error fetching publishing settings:", err)
        }
    }

    useEffect(() => {
        if (selectedBlogId && selectedProvider === 'publishing_setup') {
            fetchPublishingSettings(selectedBlogId)
        }
    }, [selectedBlogId, selectedProvider])

    const fetchConfigs = async () => {
        try {
            // Fetch AI Configs
            const { data: aiData, error: aiError } = await supabase
                .from("ai_configurations")
                .select("*")

            if (aiError) throw aiError
            setConfigs(aiData || [])

            // Fetch System Settings
            const { data: sysData, error: sysError } = await supabase
                .from("system_settings")
                .select("value")
                .eq("key", "logging_config")
                .single()

            if (!sysError && sysData) {
                setSystemSettings({
                    enable_debug: sysData.value.enable_debug ?? true,
                    enable_error: sysData.value.enable_error ?? true,
                    auto_edit: sysData.value.auto_edit ?? false,
                    content_brief_provider: sysData.value.content_brief_provider ?? "kie_api",
                    content_brief_model: sysData.value.content_brief_model ?? "claude-haiku-4-5",
                    writer_provider: sysData.value.writer_provider ?? "kie_api",
                    writer_model: sysData.value.writer_model ?? "claude-haiku-4-5",
                    image_metadata_provider: sysData.value.image_metadata_provider ?? "kie_api",
                    image_metadata_model: sysData.value.image_metadata_model ?? "claude-haiku-4-5",
                    feature_image_provider: sysData.value.feature_image_provider ?? "kie_api",
                    feature_image_model: sysData.value.feature_image_model ?? "bytedance/seedream-v4-text-to-image",
                    inbody_image_provider: sysData.value.inbody_image_provider ?? "kie_api",
                    inbody_image_model: sysData.value.inbody_image_model ?? "bytedance/seedream-v4-text-to-image",
                    humanizer_provider: sysData.value.humanizer_provider ?? "kie_api",
                    humanizer_model: sysData.value.humanizer_model ?? "claude-haiku-4-5",
                    seo_schema_provider: sysData.value.seo_schema_provider ?? "kie_api",
                    seo_schema_model: sysData.value.seo_schema_model ?? "claude-haiku-4-5",
                    seo_schema_prompt: sysData.value.seo_schema_prompt ?? "",
                    image_featured_width: sysData.value.image_featured_width ?? 1200,
                    image_featured_height: sysData.value.image_featured_height ?? 630,
                    image_featured_format: sysData.value.image_featured_format ?? "webp",
                    image_featured_quality: sysData.value.image_featured_quality ?? 85,
                    image_inbody_width: sysData.value.image_inbody_width ?? 500,
                    image_inbody_height: sysData.value.image_inbody_height ?? 1000,
                    image_inbody_format: sysData.value.image_inbody_format ?? "webp",
                    image_inbody_quality: sysData.value.image_inbody_quality ?? 85,
                    feature_image_prompt: sysData.value.feature_image_prompt ?? "feature-img-01-26-101",
                    inbody_image_prompt: sysData.value.inbody_image_prompt ?? "infographic-image-01-26-101"
                })
            }

            // Fetch Crawl Setup Settings
            const { data: crawlData, error: crawlError } = await supabase
                .from("system_settings")
                .select("value")
                .eq("key", "serp_crawl_config")
                .single()

            if (!crawlError && crawlData) {
                setSerpCrawlSettings({
                    max_h2: crawlData.value.max_h2 ?? 30,
                    max_h3: crawlData.value.max_h3 ?? 30,
                    max_h4: crawlData.value.max_h4 ?? 20,
                    max_h5: crawlData.value.max_h5 ?? 2,
                    max_h6: crawlData.value.max_h6 ?? 2
                })
            }

            // Auto-populate form if config exists for selected provider
            const current = aiData?.find(c => c.provider === selectedProvider)
            if (current) {
                setFormData({ api_key: current.api_key || "" })
            }
        } catch (err: any) {
            console.error("Error fetching configs:", err)
        } finally {
            setIsLoading(false)
        }
    }

    const fetchPrompts = async () => {
        try {
            const { data, error } = await supabase
                .from("ai_prompts")
                .select("*")
                .order("name", { ascending: true })

            if (error) {
                console.error("Error fetching prompts:", error.message)
                return
            }
            setPrompts(data || [])

            // Auto-select first prompt if none selected
            if (data && data.length > 0 && !selectedPromptId) {
                handleSelectPrompt(data[0])
            }
        } catch (err) {
            console.error("Failed to fetch prompts:", err)
        }
    }

    const handleSelectPrompt = (prompt: any) => {
        setSelectedPromptId(prompt.id)
        setPromptFormData({
            name: prompt.name || "",
            slug: prompt.slug || "",
            system_prompt: prompt.system_prompt || "",
            user_prompt_template: prompt.user_prompt_template || "",
            variables: JSON.stringify(prompt.variables, null, 2) || "[]",
            mockup_image_url: prompt.mockup_image_url || "",
            is_published: prompt.is_published ?? true
        })
    }

    useEffect(() => {
        const current = configs.find(c => c.provider === selectedProvider)
        setFormData({ api_key: current?.api_key || "" })
    }, [selectedProvider, configs])

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSaving(true)
        const toastId = toast.loading("Saving configuration...")

        try {
            if (selectedProvider === 'system_ops' || selectedProvider === 'image_templates' || selectedProvider === 'editor_setup') {
                // 1. Save full system settings (operators + other config) to system_settings
                const { error: sysError } = await supabase
                    .from("system_settings")
                    .upsert({
                        key: "logging_config",
                        value: systemSettings,
                        updated_at: new Date().toISOString()
                    }, { onConflict: "key" })
                if (sysError) throw sysError

                // 2. For each task, upsert the selected model into the correct provider row in ai_configurations
                const taskMappings = [
                    { provider: systemSettings.content_brief_provider, column: 'content_brief_model', model: systemSettings.content_brief_model },
                    { provider: systemSettings.writer_provider, column: 'writer_model', model: systemSettings.writer_model },
                    { provider: systemSettings.image_metadata_provider, column: 'image_metadata_model', model: systemSettings.image_metadata_model },
                    { provider: systemSettings.feature_image_provider, column: 'feature_image_model', model: systemSettings.feature_image_model },
                    { provider: systemSettings.inbody_image_provider, column: 'inbody_image_model', model: systemSettings.inbody_image_model },
                    { provider: systemSettings.humanizer_provider, column: 'humanizer_model', model: systemSettings.humanizer_model },
                    { provider: systemSettings.seo_schema_provider, column: 'seo_schema_model', model: systemSettings.seo_schema_model },
                ]

                // Group by provider to batch upserts
                const byProvider: Record<string, Record<string, string>> = {}
                for (const t of taskMappings) {
                    if (!byProvider[t.provider]) byProvider[t.provider] = {}
                    byProvider[t.provider][t.column] = t.model
                }

                const upsertPromises = Object.entries(byProvider).map(([provider, modelCols]) =>
                    supabase
                        .from("ai_configurations")
                        .upsert({ provider, ...modelCols, updated_at: new Date().toISOString() }, { onConflict: "provider" })
                )

                const results = await Promise.all(upsertPromises)
                const upsertError = results.find(r => r.error)?.error
                if (upsertError) throw upsertError

                toast.success(`System settings and model configurations saved!`, { id: toastId })

            } else if (selectedProvider === 'prompt_setup') {
                const { error } = await supabase
                    .from("ai_prompts")
                    .upsert({
                        id: selectedPromptId || undefined,
                        name: promptFormData.name,
                        slug: promptFormData.slug,
                        system_prompt: promptFormData.system_prompt,
                        user_prompt_template: promptFormData.user_prompt_template,
                        variables: JSON.parse(promptFormData.variables || "[]"),
                        mockup_image_url: promptFormData.mockup_image_url || null,
                        is_published: promptFormData.is_published,
                        updated_at: new Date().toISOString()
                    }, { onConflict: "slug" })

                if (error) throw error
                toast.success(`Prompt "${promptFormData.name}" saved!`, { id: toastId })
                fetchPrompts()

                // Fire-and-forget: tell the worker to drop this prompt from its in-memory cache
                // so the next publish job uses the updated version without waiting for TTL expiry
                fetch('/api/prompts/cache-bust', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ slug: promptFormData.slug }),
                }).catch(() => { /* non-fatal — 1h TTL is the fallback */ })
            } else if (selectedProvider === 'publishing_setup') {
                // 1. Update Blog Username if changed
                if (selectedBlog) {
                    const { error: blogError } = await supabase
                        .from("blogs")
                        .update({ 
                            wp_username: selectedBlog.wp_username,
                            author_name: selectedBlog.author_name,
                            author_url: selectedBlog.author_url
                        })
                        .eq("id", selectedBlogId)
                    if (blogError) throw blogError
                }

                // Prepare settings with initialized next_run_at if activating
                const upsertData: any = {
                    blog_id: selectedBlogId,
                    user_id: (await supabase.auth.getUser()).data.user?.id,
                    ...publishingSettings,
                    updated_at: new Date().toISOString()
                };

                if (publishingSettings.schedule_active) {
                    const [hours, minutes] = publishingSettings.start_time.split(':').map(Number);
                    const runDate = new Date();
                    runDate.setUTCHours(hours, minutes, 0, 0);
                    // If start time was earlier today, move to tomorrow
                    if (runDate.getTime() < Date.now()) {
                        runDate.setUTCDate(runDate.getUTCDate() + 1);
                    }
                    upsertData.next_run_at = runDate.toISOString();
                }

                const { error: pubError } = await supabase
                    .from("blog_publishing_settings")
                    .upsert(upsertData, { onConflict: "blog_id" })
                
                if (pubError) throw pubError
                toast.success(`Publishing settings for ${selectedBlog?.name} saved!`, { id: toastId })
                refreshData()
            } else {
                // For individual provider pages: only save the API key
                const { error } = await supabase
                    .from("ai_configurations")
                    .upsert({
                        provider: selectedProvider,
                        api_key: formData.api_key,
                        updated_at: new Date().toISOString()
                    }, { onConflict: "provider" })

                if (error) throw error
                toast.success(`${selectedProvider.toUpperCase()} API key saved!`, { id: toastId })
            }

            fetchConfigs()
        } catch (err: any) {
            toast.error(err.message, { id: toastId })
        } finally {
            setIsSaving(false)
        }
    }

    if (isLoading) {
        return (
            <div className="flex h-[80vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 max-w-4xl mx-auto">
            {/* Header */}
            <div>
                <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 rounded-xl bg-orange-500/10 border border-orange-500/20">
                        <Shield className="h-6 w-6 text-orange-500" />
                    </div>
                    <h1 className="text-3xl font-bold tracking-tight">Super Admin: Site Setup</h1>
                </div>
                <p className="text-muted-foreground">Manage centralized API keys and platform configurations for the autopilot engine.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Sidebar - Provider Selection */}
                <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider px-2">AI Providers</h3>
                    <div className="space-y-2">
                        {PROVIDERS.map((provider) => (
                            <button
                                key={provider.id}
                                onClick={() => setSelectedProvider(provider.id)}
                                className={cn(
                                    "w-full flex items-center gap-3 p-4 rounded-2xl border text-left transition-all",
                                    selectedProvider === provider.id
                                        ? "bg-primary border-primary text-primary-foreground shadow-lg shadow-primary/20 scale-[1.02]"
                                        : "bg-card border-border hover:bg-accent/50"
                                )}
                            >
                                <provider.icon className={cn("h-5 w-5", selectedProvider === provider.id ? "text-primary-foreground" : "text-primary")} />
                                <div>
                                    <div className="font-bold text-sm">{provider.name}</div>
                                    <div className={cn("text-[10px] line-clamp-1 opacity-70", selectedProvider === provider.id ? "text-primary-foreground" : "text-muted-foreground")}>
                                        {provider.id === 'openrouter' ? 'Multi-Provider' : 'Direct Access'}
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Main Form Area */}
                <div className="md:col-span-2">
                    <form onSubmit={handleSave} className="space-y-6 rounded-3xl border bg-card/50 p-8 backdrop-blur-sm">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20">
                                <SelectedProviderIcon className="h-8 w-8 text-primary" />
                            </div>
                            <div>
                                <h2 className="text-xl font-bold">{PROVIDERS.find(p => p.id === selectedProvider)?.name} Configuration</h2>
                                <p className="text-sm text-muted-foreground">{PROVIDERS.find(p => p.id === selectedProvider)?.description}</p>
                            </div>
                        </div>

                        {selectedProvider !== 'system_ops' && selectedProvider !== 'editor_setup' && selectedProvider !== 'serp_crawl_setup' && selectedProvider !== 'prompt_setup' && selectedProvider !== 'image_templates' && selectedProvider !== 'cloudflare_r2' && selectedProvider !== 'publishing_setup' && (
                            <div className="space-y-4">
                                <div className="space-y-2">
                                    <label className="text-sm font-medium flex items-center gap-2">
                                        <Key className="h-4 w-4 text-primary" /> API Key
                                    </label>
                                    <input
                                        type="password"
                                        value={formData.api_key}
                                        onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                                        className="w-full bg-background border rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-all"
                                        placeholder={`Enter ${selectedProvider} API Key`}
                                        required
                                    />
                                </div>
                            </div>
                        )}

                        {selectedProvider === 'serp_crawl_setup' && (
                            <div className="space-y-4">
                                <div className="p-4 mb-4 rounded-2xl bg-blue-500/5 border border-blue-500/10 text-blue-600 dark:text-blue-400 text-xs flex gap-3">
                                    <AlertCircle className="h-5 w-5 shrink-0" />
                                    <p>Set to <strong>0</strong> if you do not want to extract and save that specific heading type.</p>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium flex items-center gap-2">Max H2 Tags</label>
                                        <input
                                            type="number"
                                            value={serpCrawlSettings.max_h2}
                                            onChange={(e) => setSerpCrawlSettings({ ...serpCrawlSettings, max_h2: parseInt(e.target.value) || 0 })}
                                            className="w-full bg-background border rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-all"
                                            min="0"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium flex items-center gap-2">Max H3 Tags</label>
                                        <input
                                            type="number"
                                            value={serpCrawlSettings.max_h3}
                                            onChange={(e) => setSerpCrawlSettings({ ...serpCrawlSettings, max_h3: parseInt(e.target.value) || 0 })}
                                            className="w-full bg-background border rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-all"
                                            min="0"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium flex items-center gap-2">Max H4 Tags</label>
                                        <input
                                            type="number"
                                            value={serpCrawlSettings.max_h4}
                                            onChange={(e) => setSerpCrawlSettings({ ...serpCrawlSettings, max_h4: parseInt(e.target.value) || 0 })}
                                            className="w-full bg-background border rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-all"
                                            min="0"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium flex items-center gap-2">Max H5 Tags</label>
                                        <input
                                            type="number"
                                            value={serpCrawlSettings.max_h5}
                                            onChange={(e) => setSerpCrawlSettings({ ...serpCrawlSettings, max_h5: parseInt(e.target.value) || 0 })}
                                            className="w-full bg-background border rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-all"
                                            min="0"
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium flex items-center gap-2">Max H6 Tags</label>
                                        <input
                                            type="number"
                                            value={serpCrawlSettings.max_h6}
                                            onChange={(e) => setSerpCrawlSettings({ ...serpCrawlSettings, max_h6: parseInt(e.target.value) || 0 })}
                                            className="w-full bg-background border rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-all"
                                            min="0"
                                            required
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {selectedProvider === 'google' && (
                            <div className="mt-4 p-4 rounded-2xl bg-blue-500/5 border border-blue-500/10 text-blue-600 dark:text-blue-400 text-xs flex gap-3">
                                <AlertCircle className="h-5 w-5 shrink-0" />
                                <p>Model selection for Google AI is managed centrally in <strong>System Setup → AI Generation Global Setup</strong>. Enter your API key above and save.</p>
                            </div>
                        )}

                        {selectedProvider === 'kie_api' && (
                            <div className="mt-4 p-4 rounded-2xl bg-blue-500/5 border border-blue-500/10 text-blue-600 dark:text-blue-400 text-xs flex gap-3">
                                <AlertCircle className="h-5 w-5 shrink-0" />
                                <p>Model selection for Kie API is managed centrally in <strong>System Setup → AI Generation Global Setup</strong>. Enter your API key above and save.</p>
                            </div>
                        )}

                        {selectedProvider === 'openrouter' && (
                            <div className="mt-4 p-4 rounded-2xl bg-blue-500/5 border border-blue-500/10 text-blue-600 dark:text-blue-400 text-xs flex gap-3">
                                <AlertCircle className="h-5 w-5 shrink-0" />
                                <p>Model selection for OpenRouter is managed centrally in <strong>System Setup → AI Generation Global Setup</strong>. Enter your API key above and save.</p>
                            </div>
                        )}

                        {selectedProvider === 'prompt_setup' && (
                            <div className="space-y-6">
                                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
                                    {prompts.map((p) => (
                                        <button
                                            key={p.id}
                                            type="button"
                                            onClick={() => handleSelectPrompt(p)}
                                            className={cn(
                                                "px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap border transition-all",
                                                selectedPromptId === p.id
                                                    ? "bg-primary text-primary-foreground border-primary"
                                                    : "bg-card text-muted-foreground border-border hover:bg-accent"
                                            )}
                                        >
                                            {p.name}
                                        </button>
                                    ))}
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setSelectedPromptId(null);
                                            setPromptFormData({
                                                name: "New Prompt",
                                                slug: "new-prompt",
                                                system_prompt: "",
                                                user_prompt_template: "",
                                                variables: "[]",
                                                mockup_image_url: "",
                                                is_published: true
                                            });
                                        }}
                                        className="px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap border border-dashed border-primary/40 text-primary hover:bg-primary/5 transition-all"
                                    >
                                        + Add New
                                    </button>
                                </div>

                                <div className="grid grid-cols-1 gap-6 pt-4 border-t border-border/50">
                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Prompt Name</label>
                                            <input
                                                type="text"
                                                value={promptFormData.name}
                                                onChange={(e) => setPromptFormData({ ...promptFormData, name: e.target.value })}
                                                className="w-full bg-background border rounded-xl px-4 py-2 text-sm font-bold focus:ring-2 focus:ring-primary outline-none"
                                                placeholder="e.g. Content Brief Generator"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Slug (Identifier)</label>
                                            <input
                                                type="text"
                                                value={promptFormData.slug}
                                                onChange={(e) => setPromptFormData({ ...promptFormData, slug: e.target.value.toLowerCase().replace(/ /g, '-') })}
                                                className="w-full bg-background border rounded-xl px-4 py-2 text-sm font-mono focus:ring-2 focus:ring-primary outline-none"
                                                placeholder="content-brief"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Mockup Image URL</label>
                                        <input
                                            type="text"
                                            value={promptFormData.mockup_image_url || ""}
                                            onChange={(e) => setPromptFormData({ ...promptFormData, mockup_image_url: e.target.value })}
                                            className="w-full bg-background border rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-primary outline-none"
                                            placeholder="https://example.com/mockup.png"
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">System Prompt</label>
                                        <textarea
                                            value={promptFormData.system_prompt}
                                            onChange={(e) => setPromptFormData({ ...promptFormData, system_prompt: e.target.value })}
                                            className="w-full bg-background border rounded-xl px-4 py-3 text-xs font-medium min-h-[150px] focus:ring-2 focus:ring-primary outline-none leading-relaxed"
                                            placeholder="Expert content strategist instructions..."
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">User Prompt Template</label>
                                        <textarea
                                            value={promptFormData.user_prompt_template}
                                            onChange={(e) => setPromptFormData({ ...promptFormData, user_prompt_template: e.target.value })}
                                            className="w-full bg-background border rounded-xl px-4 py-3 text-xs font-medium min-h-[150px] focus:ring-2 focus:ring-primary outline-none leading-relaxed"
                                            placeholder="Generate a brief for: {{keyword}}..."
                                        />
                                    </div>

                                    <div className="flex items-center justify-between p-4 rounded-xl border bg-background hover:border-primary/50 transition-colors">
                                        <div className="space-y-0.5">
                                            <h4 className="text-sm font-bold">Published</h4>
                                            <p className="text-[11px] text-muted-foreground">Make this prompt available for the article generator.</p>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="sr-only peer"
                                                checked={promptFormData.is_published}
                                                onChange={(e) => setPromptFormData({ ...promptFormData, is_published: e.target.checked })}
                                            />
                                            <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                                        </label>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex items-center justify-between">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Variables (JSON Schema)</label>
                                            <span className="text-[8px] font-bold text-primary/60 italic">Used for documentation</span>
                                        </div>
                                        <textarea
                                            value={promptFormData.variables}
                                            onChange={(e) => setPromptFormData({ ...promptFormData, variables: e.target.value })}
                                            className="w-full bg-background border rounded-xl px-4 py-2 text-[10px] font-mono min-h-[60px] focus:ring-2 focus:ring-primary outline-none"
                                            placeholder='["keyword", "intent"]'
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {selectedProvider !== 'openrouter' && selectedProvider !== 'google' && selectedProvider !== 'serpapi' && selectedProvider !== 'system_ops' && selectedProvider !== 'editor_setup' && selectedProvider !== 'serp_crawl_setup' && selectedProvider !== 'prompt_setup' && selectedProvider !== 'image_templates' && selectedProvider !== 'cloudflare_r2' && (
                            <div className="p-4 mt-4 rounded-2xl bg-amber-500/5 border border-amber-500/10 text-amber-600 dark:text-amber-400 text-xs flex gap-3">
                                <AlertCircle className="h-5 w-5 shrink-0" />
                                <p>Direct provider support is coming soon. Please use <strong>OpenRouter</strong> or <strong>Google</strong> for immediate multi-model functionality.</p>
                            </div>
                        )}

                        {selectedProvider === 'image_templates' && (
                            <div className="space-y-8 mt-4 animate-in fade-in duration-300">
                                <div className="space-y-6">
                                    <div className="border-b border-border/50 pb-4">
                                        <h3 className="flex items-center gap-2 text-lg font-bold text-foreground">
                                            <ImageIcon className="h-5 w-5 text-primary" /> Image Template Selection
                                        </h3>
                                        <p className="text-xs text-muted-foreground mt-1">Select the AI prompts to use when generating Featured and In-Body images.</p>
                                    </div>

                                    <div className="space-y-6">
                                        {/* Featured Image Selector */}
                                        <div className="space-y-3">
                                            <label className="text-sm font-bold text-primary">Featured Image Template</label>
                                            <div className="grid grid-cols-1 gap-3">
                                                {prompts.filter(p => p.name.includes("Feature Image") && !p.slug.toLowerCase().includes("metadata") && !p.name.toLowerCase().includes("metadata")).map(p => (
                                                    <button
                                                        key={p.slug}
                                                        type="button"
                                                        onClick={() => setSystemSettings(s => ({ ...s, feature_image_prompt: p.slug }))}
                                                        className={cn(
                                                            "flex flex-row items-center p-4 rounded-2xl border text-left transition-all gap-4 overflow-hidden min-h-[140px]",
                                                            systemSettings.feature_image_prompt === p.slug
                                                                ? "bg-primary/10 border-primary shadow-sm ring-2 ring-primary/20"
                                                                : "bg-background hover:bg-accent hover:border-primary/50"
                                                        )}
                                                    >
                                                        <div className="flex-1 min-w-0 py-2">
                                                            <div className="font-bold text-base truncate">{p.name}</div>
                                                            <div className="text-xs mt-1 font-mono text-muted-foreground opacity-80 break-all">{p.slug}</div>
                                                            {systemSettings.feature_image_prompt === p.slug && (
                                                                <div className="mt-4 flex items-center gap-1.5 text-[11px] font-bold text-primary bg-primary/10 w-fit px-2.5 py-1.5 rounded-md">
                                                                    <CheckCircle2 className="h-4 w-4" /> Selected
                                                                </div>
                                                            )}
                                                        </div>
                                                        {p.mockup_image_url ? (
                                                            <img src={p.mockup_image_url} alt="mockup" className="w-[160px] h-[90px] sm:w-[220px] sm:h-[120px] object-cover rounded-xl border border-border shadow-sm shrink-0 bg-muted" />
                                                        ) : (
                                                            <div className="w-[160px] h-[90px] sm:w-[220px] sm:h-[120px] rounded-xl border border-dashed border-border/50 bg-accent/20 flex flex-col gap-1 items-center justify-center shrink-0 text-muted-foreground">
                                                                <ImageIcon className="h-5 w-5 opacity-50" />
                                                                <span className="text-[10px] font-medium opacity-50">No Preview</span>
                                                            </div>
                                                        )}
                                                    </button>
                                                ))}
                                                {prompts.filter(p => p.name.includes("Feature Image") && !p.slug.toLowerCase().includes("metadata") && !p.name.toLowerCase().includes("metadata")).length === 0 && (
                                                    <div className="text-xs text-muted-foreground p-4 border rounded-2xl border-dashed bg-accent/30 text-center">No "Feature Image" templates found.</div>
                                                )}
                                            </div>
                                        </div>

                                        {/* In-Body Image Selector */}
                                        <div className="space-y-3">
                                            <label className="text-sm font-bold text-primary">In-Body Image Template</label>
                                            <div className="grid grid-cols-1 gap-3">
                                                {prompts.filter(p => p.name.includes("Infographic Image") && !p.slug.toLowerCase().includes("metadata") && !p.name.toLowerCase().includes("metadata")).map(p => (
                                                    <button
                                                        key={p.slug}
                                                        type="button"
                                                        onClick={() => setSystemSettings(s => ({ ...s, inbody_image_prompt: p.slug }))}
                                                        className={cn(
                                                            "flex flex-row items-center p-4 rounded-2xl border text-left transition-all gap-4 overflow-hidden min-h-[140px]",
                                                            systemSettings.inbody_image_prompt === p.slug
                                                                ? "bg-primary/10 border-primary shadow-sm ring-2 ring-primary/20"
                                                                : "bg-background hover:bg-accent hover:border-primary/50"
                                                        )}
                                                    >
                                                        <div className="flex-1 min-w-0 py-2">
                                                            <div className="font-bold text-base truncate">{p.name}</div>
                                                            <div className="text-xs mt-1 font-mono text-muted-foreground opacity-80 break-all">{p.slug}</div>
                                                            {systemSettings.inbody_image_prompt === p.slug && (
                                                                <div className="mt-4 flex items-center gap-1.5 text-[11px] font-bold text-primary bg-primary/10 w-fit px-2.5 py-1.5 rounded-md">
                                                                    <CheckCircle2 className="h-4 w-4" /> Selected
                                                                </div>
                                                            )}
                                                        </div>
                                                        {p.mockup_image_url ? (
                                                            <img src={p.mockup_image_url} alt="mockup" className="w-[80px] h-[140px] sm:w-[100px] sm:h-[180px] object-cover rounded-lg border border-border shadow-sm shrink-0 bg-muted" />
                                                        ) : (
                                                            <div className="w-[80px] h-[140px] sm:w-[100px] sm:h-[180px] rounded-lg border border-dashed border-border/50 bg-accent/20 flex flex-col gap-1 items-center justify-center shrink-0 text-muted-foreground">
                                                                <ImageIcon className="h-5 w-5 opacity-50" />
                                                                <span className="text-[10px] font-medium opacity-50 text-center px-2">No Preview</span>
                                                            </div>
                                                        )}
                                                    </button>
                                                ))}
                                                {prompts.filter(p => p.name.includes("Infographic Image") && !p.slug.toLowerCase().includes("metadata") && !p.name.toLowerCase().includes("metadata")).length === 0 && (
                                                    <div className="text-xs text-muted-foreground p-4 border rounded-2xl border-dashed bg-accent/30 text-center">No "Infographic Image" templates found.</div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {selectedProvider === 'editor_setup' && (
                            <div className="space-y-8 mt-4 animate-in fade-in duration-300">
                                <div className="space-y-6">
                                    <div className="border-b border-border/50 pb-4">
                                        <h3 className="flex items-center gap-2 text-lg font-bold text-foreground">
                                            <Edit className="h-5 w-5 text-primary" /> Editor Agent Setup
                                        </h3>
                                        <p className="text-xs text-muted-foreground mt-1">Configure how the Editor Agent behaves in the generation pipeline.</p>
                                    </div>
                                    <div className="grid gap-4">
                                        <div className="flex items-center justify-between p-4 rounded-xl border bg-background hover:border-primary/50 transition-colors">
                                            <div className="space-y-0.5">
                                                <h4 className="text-sm font-bold flex items-center gap-2">
                                                    Enable Auto Edit
                                                </h4>
                                                <p className="text-[11px] text-muted-foreground">Automatically complete the editing step using AI. If disabled, jobs will pause for manual review.</p>
                                            </div>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    className="sr-only peer"
                                                    checked={systemSettings.auto_edit}
                                                    onChange={(e) => setSystemSettings(s => ({ ...s, auto_edit: e.target.checked }))}
                                                />
                                                <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        {selectedProvider === 'publishing_setup' && (
                            <div className="space-y-8 mt-4 animate-in fade-in duration-300">
                                <div className="space-y-6">
                                    <div className="border-b border-border/50 pb-4">
                                        <h3 className="flex items-center gap-2 text-lg font-bold text-foreground">
                                            <Globe className="h-5 w-5 text-primary" /> Publishing & Scheduling
                                        </h3>
                                        <p className="text-xs text-muted-foreground mt-1">Configure automated content distribution and scheduling for your sites.</p>
                                    </div>

                                    <div className="space-y-4">
                                        <div className="space-y-2">
                                            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Select Site to Configure</label>
                                            <select
                                                value={selectedBlogId}
                                                onChange={(e) => setSelectedBlogId(e.target.value)}
                                                className="w-full bg-background border rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-all font-bold"
                                            >
                                                {blogs.map(blog => (
                                                    <option key={blog.id} value={blog.id}>{blog.name} ({blog.url})</option>
                                                ))}
                                            </select>
                                        </div>

                                        {selectedBlogId && (
                                            <div className="grid gap-6">
                                                <div className="p-6 rounded-2xl border bg-accent/5 space-y-4">
                                                    <h4 className="font-bold text-primary flex items-center gap-2">
                                                        <Settings className="h-4 w-4" /> WordPress Publishing
                                                    </h4>
                                                    <div className="space-y-2">
                                                        <label className="text-sm font-medium">WP Application Username</label>
                                                        <input
                                                            type="text"
                                                            value={selectedBlog?.wp_username || ""}
                                                            onChange={(e) => {
                                                                const val = e.target.value
                                                                setBlogs(prev => prev.map(b => b.id === selectedBlogId ? { ...b, wp_username: val } : b))
                                                            }}
                                                            className="w-full bg-background border rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-all"
                                                            placeholder="e.g. admin"
                                                        />
                                                        <p className="text-[10px] text-muted-foreground">Used for REST API authentication alongside the Application Password.</p>
                                                    </div>

                                                    <div className="space-y-4 pt-4 border-t border-border/50">
                                                        <h4 className="font-bold text-sm text-primary">Article Author profiles</h4>
                                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                            <div className="space-y-2">
                                                                <label className="text-xs font-semibold text-muted-foreground">Post Author Name</label>
                                                                <input
                                                                    type="text"
                                                                    value={selectedBlog?.author_name || ""}
                                                                    onChange={(e) => {
                                                                        const val = e.target.value
                                                                        setBlogs(prev => prev.map(b => b.id === selectedBlogId ? { ...b, author_name: val } : b))
                                                                    }}
                                                                    className="w-full bg-background border rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary outline-none"
                                                                    placeholder="e.g. John Doe"
                                                                />
                                                            </div>
                                                            <div className="space-y-2">
                                                                <label className="text-xs font-semibold text-muted-foreground">Author Profile Url</label>
                                                                <input
                                                                    type="text"
                                                                    value={selectedBlog?.author_url || ""}
                                                                    onChange={(e) => {
                                                                        const val = e.target.value
                                                                        setBlogs(prev => prev.map(b => b.id === selectedBlogId ? { ...b, author_url: val } : b))
                                                                    }}
                                                                    className="w-full bg-background border rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-primary outline-none"
                                                                    placeholder="e.g. https://example.com/author/john"
                                                                />
                                                            </div>
                                                        </div>
                                                        <p className="text-[10px] text-muted-foreground">Optional fields for SEO schema and article attribution.</p>
                                                    </div>

                                                    <div className="space-y-2 pt-2 border-t border-border/50">
                                                        <div className="flex items-center justify-between">
                                                            <label className="text-sm font-medium">Maximum Article Tags</label>
                                                            <div className="group relative">
                                                                <AlertCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                                                                <div className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-popover text-[10px] text-popover-foreground border rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                                                                    0 means no tags will be published on WordPress.
                                                                </div>
                                                            </div>
                                                        </div>
                                                        <input
                                                            type="number"
                                                            value={publishingSettings.max_article_tags}
                                                            onChange={(e) => setPublishingSettings(s => ({ ...s, max_article_tags: parseInt(e.target.value) || 0 }))}
                                                            className="w-full bg-background border rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-all"
                                                            min="0"
                                                        />
                                                        <p className="text-[10px] text-muted-foreground">Limit the number of secondary keywords converted to WordPress tags.</p>
                                                    </div>
                                                </div>

                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                    <div className="p-6 rounded-2xl border bg-background space-y-4">
                                                        <div className="flex items-center justify-between">
                                                            <h4 className="font-bold">Auto-Publish</h4>
                                                            <label className="relative inline-flex items-center cursor-pointer">
                                                                <input
                                                                    type="checkbox"
                                                                    className="sr-only peer"
                                                                    checked={publishingSettings.auto_publish}
                                                                    onChange={(e) => setPublishingSettings(s => ({ ...s, auto_publish: e.target.checked }))}
                                                                />
                                                                <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                                                            </label>
                                                        </div>
                                                        <p className="text-[11px] text-muted-foreground">Automatically trigger publishing when an article reaches 'generated' status.</p>
                                                        
                                                        <div className="space-y-2 pt-2">
                                                            <label className="text-sm font-medium">Default Save Status</label>
                                                            <select
                                                                value={publishingSettings.publish_save_status}
                                                                onChange={(e) => setPublishingSettings(s => ({ ...s, publish_save_status: e.target.value }))}
                                                                className="w-full bg-background border rounded-xl px-4 py-3 text-sm"
                                                            >
                                                                <option value="draft">Draft (Manual Launch)</option>
                                                                <option value="scheduled">Scheduled (WP Native)</option>
                                                                <option value="published">Published (Go Live)</option>
                                                            </select>
                                                        </div>
                                                    </div>

                                                    <div className="p-6 rounded-2xl border bg-background space-y-4">
                                                        <div className="flex items-center justify-between">
                                                            <h4 className="font-bold">Active Schedule</h4>
                                                            <label className="relative inline-flex items-center cursor-pointer">
                                                                <input
                                                                    type="checkbox"
                                                                    className="sr-only peer"
                                                                    checked={publishingSettings.schedule_active}
                                                                    onChange={(e) => setPublishingSettings(s => ({ ...s, schedule_active: e.target.checked }))}
                                                                />
                                                                <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                                                            </label>
                                                        </div>
                                                        <p className="text-[11px] text-muted-foreground">Periodically trigger new write jobs for this site automatically.</p>
                                                        
                                                        <div className="grid grid-cols-2 gap-2">
                                                            <div className="space-y-1">
                                                                <label className="text-[10px] uppercase font-bold text-muted-foreground">Frequency</label>
                                                                <select 
                                                                    value={publishingSettings.frequency}
                                                                    onChange={(e) => setPublishingSettings(s => ({ ...s, frequency: e.target.value }))}
                                                                    className="w-full bg-background border rounded-lg px-2 py-2 text-xs"
                                                                >
                                                                    <option value="daily">Daily</option>
                                                                    <option value="weekly">Weekly</option>
                                                                    <option value="monthly">Monthly</option>
                                                                </select>
                                                            </div>
                                                            <div className="space-y-1">
                                                                <label className="text-[10px] uppercase font-bold text-muted-foreground">Times</label>
                                                                <input 
                                                                    type="number"
                                                                    value={publishingSettings.times_per_period}
                                                                    onChange={(e) => setPublishingSettings(s => ({ ...s, times_per_period: parseInt(e.target.value) || 1 }))}
                                                                    className="w-full bg-background border rounded-lg px-2 py-2 text-xs"
                                                                />
                                                            </div>
                                                        </div>
                                                        
                                                        {/* RankMath Toggle */}
                                                        <div className="pt-2 border-t border-border/50">
                                                            <div className="flex items-center justify-between p-3 rounded-xl bg-orange-500/5 border border-orange-500/10">
                                                                <div className="space-y-0.5">
                                                                    <h4 className="text-xs font-bold text-orange-600 dark:text-orange-400">RankMath SEO Sync</h4>
                                                                    <p className="text-[10px] text-muted-foreground">Sync Focus Keywords, Meta Titles and Descriptions via API.</p>
                                                                </div>
                                                                <label className="relative inline-flex items-center cursor-pointer">
                                                                    <input
                                                                        type="checkbox"
                                                                        className="sr-only peer"
                                                                        checked={publishingSettings.enable_rankmath_metadata}
                                                                        onChange={(e) => setPublishingSettings(s => ({ ...s, enable_rankmath_metadata: e.target.checked }))}
                                                                    />
                                                                    <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-orange-500"></div>
                                                                </label>
                                                            </div>
                                                            <div className="flex items-center justify-between p-3 rounded-xl bg-blue-500/5 border border-blue-500/10 mt-2">
                                                                <div className="space-y-0.5">
                                                                    <h4 className="text-xs font-bold text-blue-600 dark:text-blue-400">SEO Schema Generation</h4>
                                                                    <p className="text-[10px] text-muted-foreground">Generate comprehensive Article/NewsArticle JSON-LD schema for SEO.</p>
                                                                </div>
                                                                <label className="relative inline-flex items-center cursor-pointer">
                                                                    <input
                                                                        type="checkbox"
                                                                        className="sr-only peer"
                                                                        checked={publishingSettings.enable_seo_schema_generation}
                                                                        onChange={(e) => setPublishingSettings(s => ({ ...s, enable_seo_schema_generation: e.target.checked }))}
                                                                    />
                                                                    <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-500"></div>
                                                                </label>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="p-6 rounded-2xl border bg-card space-y-6">
                                                    <h4 className="font-bold flex items-center gap-2">
                                                        <CheckCircle2 className="h-4 w-4 text-primary" /> Schedule Refinement
                                                    </h4>
                                                    
                                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                                                        <div className="space-y-3">
                                                            <label className="text-sm font-medium mb-2 block">Distribution Logic</label>
                                                            <div className="space-y-2">
                                                                <button 
                                                                    type="button"
                                                                    onClick={() => setPublishingSettings(s => ({ ...s, schedule_logic: 'spread_evenly' }))}
                                                                    className={cn(
                                                                        "w-full p-3 rounded-xl border text-xs text-left transition-all",
                                                                        publishingSettings.schedule_logic === 'spread_evenly' ? "bg-primary/10 border-primary ring-1 ring-primary" : "hover:bg-accent"
                                                                    )}
                                                                >
                                                                    <span className="font-bold block">Spread Evenly</span>
                                                                    <span className="opacity-70">Distribute posts throughout the period.</span>
                                                                </button>
                                                                <button 
                                                                    type="button"
                                                                    onClick={() => setPublishingSettings(s => ({ ...s, schedule_logic: 'all_at_once' }))}
                                                                    className={cn(
                                                                        "w-full p-3 rounded-xl border text-xs text-left transition-all",
                                                                        publishingSettings.schedule_logic === 'all_at_once' ? "bg-primary/10 border-primary ring-1 ring-primary" : "hover:bg-accent"
                                                                    )}
                                                                >
                                                                    <span className="font-bold block">All at once</span>
                                                                    <span className="opacity-70">Queue all posts starting from the set time.</span>
                                                                </button>
                                                            </div>
                                                        </div>

                                                        <div className="space-y-3">
                                                            <label className="text-sm font-medium mb-2 block">Start Time (UTC)</label>
                                                            <input 
                                                                type="time" 
                                                                value={publishingSettings.start_time}
                                                                onChange={(e) => setPublishingSettings(s => ({ ...s, start_time: e.target.value }))}
                                                                className="w-full bg-background border rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-all font-mono"
                                                            />
                                                            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                                                                <AlertCircle className="h-3 w-3" /> System uses UTC for globally consistent scheduling.
                                                            </p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {selectedProvider === 'system_ops' && (
                            <div className="space-y-8 mt-4 animate-in fade-in duration-300">
                                {/* Global System Setup Configuration */}
                                <div className="space-y-6">
                                    <div className="border-b border-border/50 pb-4">
                                        <h3 className="flex items-center gap-2 text-lg font-bold text-foreground">
                                            <Globe className="h-5 w-5 text-primary" /> Global System Setup Configuration
                                        </h3>
                                        <p className="text-xs text-muted-foreground mt-1">These settings apply globally to all standard users across the platform.</p>
                                    </div>
                                    <div className="grid gap-4">
                                        <div className="flex items-center justify-between p-4 rounded-xl border bg-background hover:border-primary/50 transition-colors">
                                            <div className="space-y-0.5">
                                                <h4 className="text-sm font-bold flex items-center gap-2">
                                                    Enable Debug Logging
                                                </h4>
                                                <p className="text-[11px] text-muted-foreground">Log ALL application lifecycle events and info payload to server (debug_log.txt).</p>
                                            </div>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    className="sr-only peer"
                                                    checked={systemSettings.enable_debug}
                                                    onChange={(e) => setSystemSettings(s => ({ ...s, enable_debug: e.target.checked }))}
                                                />
                                                <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                                            </label>
                                        </div>

                                        <div className="flex items-center justify-between p-4 rounded-xl border bg-background hover:border-red-500/50 transition-colors">
                                            <div className="space-y-0.5">
                                                <h4 className="text-sm font-bold flex items-center gap-2">
                                                    Enable Error Logging
                                                </h4>
                                                <p className="text-[11px] text-muted-foreground">Capture critical UI crashes and API failures strictly to server (error_log.txt).</p>
                                            </div>
                                            <label className="relative inline-flex items-center cursor-pointer">
                                                <input
                                                    type="checkbox"
                                                    className="sr-only peer"
                                                    checked={systemSettings.enable_error}
                                                    onChange={(e) => setSystemSettings(s => ({ ...s, enable_error: e.target.checked }))}
                                                />
                                                <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-red-500"></div>
                                            </label>
                                        </div>

                                    </div>
                                </div>

                                {/* AI Generation Global Setup */}
                                <div className="space-y-6 pt-4">
                                    <div className="border-b border-border/50 pb-4">
                                        <h3 className="flex items-center gap-2 text-lg font-bold text-foreground">
                                            <Bot className="h-5 w-5 text-primary" /> AI Generation Global Setup
                                        </h3>
                                        <p className="text-xs text-muted-foreground mt-1">Configure global API providers and models for each step of the AI generation pipeline.</p>
                                    </div>
                                    <div className="grid md:grid-cols-2 gap-6">
                                        {[
                                            { id: 'content_brief', label: 'Content Brief Model', isImage: false },
                                            { id: 'writer', label: 'Writer AI Model', isImage: false },
                                            { id: 'image_metadata', label: 'Image Metadata Model', isImage: false },
                                            { id: 'humanizer', label: 'Humanizer Model', isImage: false },
                                            { id: 'seo_schema', label: 'SEO Schema Generation Model', isImage: false },
                                            { id: 'feature_image', label: 'Feature Image Model', isImage: true },
                                            { id: 'inbody_image', label: 'In-Body Image Model', isImage: true }
                                        ].map(category => {
                                            const providerKey = `${category.id}_provider` as keyof typeof systemSettings;
                                            const modelKey = `${category.id}_model` as keyof typeof systemSettings;
                                            const providerValue = systemSettings[providerKey] as string;
                                            const modelValue = systemSettings[modelKey] as string;

                                            const getModelsList = () => {
                                                if (category.isImage) {
                                                    if (providerValue === 'kie_api') return KIE_IMAGE_MODELS;
                                                    if (providerValue === 'google') return GOOGLE_IMAGE_MODELS;
                                                    return OPENROUTER_MODELS;
                                                } else {
                                                    if (providerValue === 'kie_api') return KIE_LLM_MODELS;
                                                    if (providerValue === 'google') return GOOGLE_LLM_MODELS;
                                                    return OPENROUTER_MODELS;
                                                }
                                            }

                                            const modelsList = getModelsList();

                                            return (
                                                <div key={category.id} className="space-y-4 p-5 rounded-2xl border bg-background/50">
                                                    <h4 className="font-bold text-sm text-primary flex justify-between items-center">
                                                        {category.label}
                                                    </h4>
                                                    <div className="space-y-3">
                                                        <div className="space-y-1.5">
                                                            <label className="text-xs font-semibold text-muted-foreground">API Provider</label>
                                                            <select
                                                                value={providerValue}
                                                                onChange={(e) => {
                                                                    const newProvider = e.target.value;
                                                                    let newModel = modelsList[0]?.id; // Default fallback if switching

                                                                    // Guess best first model on switch
                                                                    if (category.isImage) {
                                                                        if (newProvider === 'kie_api') newModel = KIE_IMAGE_MODELS[0].id;
                                                                        if (newProvider === 'google') newModel = GOOGLE_IMAGE_MODELS[0].id;
                                                                        if (newProvider === 'openrouter') newModel = OPENROUTER_MODELS[0].id;
                                                                    } else {
                                                                        if (newProvider === 'kie_api') newModel = KIE_LLM_MODELS[0].id;
                                                                        if (newProvider === 'google') newModel = GOOGLE_LLM_MODELS[0].id;
                                                                        if (newProvider === 'openrouter') newModel = OPENROUTER_MODELS[0].id;
                                                                    }

                                                                    setSystemSettings(s => ({
                                                                        ...s,
                                                                        [providerKey]: newProvider,
                                                                        [modelKey]: newModel
                                                                    }))
                                                                }}
                                                                className="w-full bg-card border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none cursor-pointer"
                                                            >
                                                                <option value="kie_api">Kie API</option>
                                                                <option value="openrouter">OpenRouter</option>
                                                                <option value="google">Google AI</option>
                                                            </select>
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            <label className="text-xs font-semibold text-muted-foreground">Model</label>
                                                            <select
                                                                value={modelValue}
                                                                onChange={(e) => setSystemSettings(s => ({ ...s, [modelKey]: e.target.value }))}
                                                                className="w-full bg-card border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none cursor-pointer"
                                                            >
                                                                {modelsList.map(m => (
                                                                    <option key={m.id} value={m.id}>{m.name}</option>
                                                                ))}
                                                            </select>
                                                        </div>

                                                        {/* SEO Schema Prompt Selector — only shown for the seo_schema card */}
                                                        {category.id === 'seo_schema' && (
                                                            <div className="space-y-1.5 pt-1 border-t border-border/40">
                                                                <label className="text-xs font-semibold text-muted-foreground">Schema Generation Prompt</label>
                                                                <select
                                                                    value={systemSettings.seo_schema_prompt}
                                                                    onChange={(e) => setSystemSettings(s => ({ ...s, seo_schema_prompt: e.target.value }))}
                                                                    className="w-full bg-card border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none cursor-pointer"
                                                                >
                                                                    <option value="">— Select a prompt —</option>
                                                                    {prompts.map(p => (
                                                                        <option key={p.slug} value={p.slug}>
                                                                            {p.name} ({p.slug})
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                                <p className="text-[10px] text-muted-foreground">
                                                                    This prompt&#39;s system &amp; user message will be used when generating JSON-LD schema at publish time.
                                                                </p>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>
                                </div>

                                {/* Sharp Image Output Configuration */}
                                <div className="space-y-6 pt-4">
                                    <div className="border-b border-border/50 pb-4">
                                        <h3 className="flex items-center gap-2 text-lg font-bold text-foreground">
                                            <Globe className="h-5 w-5 text-primary" /> Sharp Image Output Setup
                                        </h3>
                                        <p className="text-xs text-muted-foreground mt-1">Configure dimensions, formats, and quality for the Sharp image processing pipeline.</p>
                                    </div>

                                    <div className="grid md:grid-cols-2 gap-6">
                                        {/* Featured Image */}
                                        <div className="space-y-4 p-5 rounded-2xl border bg-background/50">
                                            <h4 className="font-bold text-sm text-primary flex justify-between items-center">
                                                Featured Image
                                            </h4>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <label className="text-xs font-semibold text-muted-foreground">Width (px)</label>
                                                    <input
                                                        type="number"
                                                        value={systemSettings.image_featured_width}
                                                        onChange={(e) => setSystemSettings(s => ({ ...s, image_featured_width: parseInt(e.target.value) || 1200 }))}
                                                        className="w-full bg-card border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-xs font-semibold text-muted-foreground">Height (px)</label>
                                                    <input
                                                        type="number"
                                                        value={systemSettings.image_featured_height}
                                                        onChange={(e) => setSystemSettings(s => ({ ...s, image_featured_height: parseInt(e.target.value) || 630 }))}
                                                        className="w-full bg-card border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none"
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <label className="text-xs font-semibold text-muted-foreground">Format</label>
                                                    <select
                                                        value={systemSettings.image_featured_format}
                                                        onChange={(e) => setSystemSettings(s => ({ ...s, image_featured_format: e.target.value }))}
                                                        className="w-full bg-card border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none cursor-pointer"
                                                    >
                                                        <option value="webp">WebP</option>
                                                        <option value="jpeg">JPEG</option>
                                                        <option value="png">PNG</option>
                                                        <option value="avif">AVIF</option>
                                                    </select>
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-xs font-semibold text-muted-foreground">Quality (1-100)</label>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        max="100"
                                                        value={systemSettings.image_featured_quality}
                                                        onChange={(e) => setSystemSettings(s => ({ ...s, image_featured_quality: parseInt(e.target.value) || 85 }))}
                                                        className="w-full bg-card border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none"
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        {/* Post Body Image */}
                                        <div className="space-y-4 p-5 rounded-2xl border bg-background/50">
                                            <h4 className="font-bold text-sm text-primary flex justify-between items-center">
                                                Post Body Image (In-Body)
                                            </h4>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <label className="text-xs font-semibold text-muted-foreground">Width (px)</label>
                                                    <input
                                                        type="number"
                                                        value={systemSettings.image_inbody_width}
                                                        onChange={(e) => setSystemSettings(s => ({ ...s, image_inbody_width: parseInt(e.target.value) || 500 }))}
                                                        className="w-full bg-card border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none"
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-xs font-semibold text-muted-foreground">Height (px)</label>
                                                    <input
                                                        type="number"
                                                        value={systemSettings.image_inbody_height}
                                                        onChange={(e) => setSystemSettings(s => ({ ...s, image_inbody_height: parseInt(e.target.value) || 1000 }))}
                                                        className="w-full bg-card border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none"
                                                    />
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <label className="text-xs font-semibold text-muted-foreground">Format</label>
                                                    <select
                                                        value={systemSettings.image_inbody_format}
                                                        onChange={(e) => setSystemSettings(s => ({ ...s, image_inbody_format: e.target.value }))}
                                                        className="w-full bg-card border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none cursor-pointer"
                                                    >
                                                        <option value="webp">WebP</option>
                                                        <option value="jpeg">JPEG</option>
                                                        <option value="png">PNG</option>
                                                        <option value="avif">AVIF</option>
                                                    </select>
                                                </div>
                                                <div className="space-y-2">
                                                    <label className="text-xs font-semibold text-muted-foreground">Quality (1-100)</label>
                                                    <input
                                                        type="number"
                                                        min="1"
                                                        max="100"
                                                        value={systemSettings.image_inbody_quality}
                                                        onChange={(e) => setSystemSettings(s => ({ ...s, image_inbody_quality: parseInt(e.target.value) || 85 }))}
                                                        className="w-full bg-card border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary outline-none"
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="pt-4 border-t border-border mt-8 flex justify-end">
                            <button
                                type="submit"
                                disabled={isSaving || (selectedProvider !== 'openrouter' && selectedProvider !== 'openai' && selectedProvider !== 'claude' && selectedProvider !== 'google' && selectedProvider !== 'kie_api' && selectedProvider !== 'serpapi' && selectedProvider !== 'system_ops' && selectedProvider !== 'editor_setup' && selectedProvider !== 'image_templates' && selectedProvider !== 'serp_crawl_setup' && selectedProvider !== 'prompt_setup' && selectedProvider !== 'cloudflare_r2' && selectedProvider !== 'publishing_setup')}
                                className="flex items-center gap-2 rounded-xl bg-primary px-8 py-3 font-bold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:scale-[1.05] active:scale-[0.95] disabled:opacity-50 disabled:hover:scale-100"
                            >
                                {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                                Save Configuration
                            </button>
                        </div>
                    </form>

                    <div className="mt-6 p-6 rounded-3xl border bg-primary/5 border-primary/10 flex gap-4">
                        <div className="p-2 rounded-full bg-primary/10 h-fit">
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                        </div>
                        <div className="text-xs text-muted-foreground leading-relaxed">
                            <p className="font-bold text-primary mb-1">Security Note:</p>
                            API keys are stored in the database protected by Row Level Security. Only authorized super admin accounts can access or modify these values.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
