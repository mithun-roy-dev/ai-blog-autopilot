"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Settings, Shield, Save, Loader2, AlertCircle, CheckCircle2, Cpu, Globe, Zap, Key, Search, Terminal, Bot, Database } from "lucide-react"
import { createClient } from "@/utils/supabase/client"
import { toast } from "sonner"
import { cn } from "@/utils/cn"

const PROVIDERS = [
    { id: "openrouter", name: "OpenRouter", icon: Globe, description: "Access OpenAI, Anthropic, Google and deepseek via a single API." },
    { id: "openai", name: "OpenAI", icon: Zap, description: "Direct access to GPT-4o, GPT-3.5-Turbo and more." },
    { id: "claude", name: "Claude (Anthropic)", icon: Cpu, description: "High-performance AI with advanced reasoning." },
    { id: "google", name: "Google AI", icon: Bot, description: "Direct access to Gemini and Imagen models." },
    { id: "serpapi", name: "SerpAPI", icon: Search, description: "Google Search results for content research and analysis." },
    { id: "serp_crawl_setup", name: "Crawl Setup", icon: Globe, description: "Configure SERP analysis extraction limits." },
    { id: "prompt_setup", name: "Prompt Setup", icon: Terminal, description: "Manage and refine AI instructions dynamically." },
    { id: "system_ops", name: "System Setup", icon: Shield, description: "Manage global application settings and operational toggles." },
    { id: "cloudflare_r2", name: "Cloudflare R2", icon: Database, description: "Configure API credentials for Cloudflare R2 object storage." },
]

const OPENROUTER_MODELS = [
    { id: "google/gemini-3-flash-preview", name: "Gemini 3 Flash Preview" },
    { id: "google/gemini-2.5-flash-lite", name: "Gemini 2.5 Flash Lite" },
    { id: "anthropic/claude-sonnet-4.6", name: "Claude Sonnet 4.6" },
    { id: "google/gemma-3-27b-it:free", name: "Gemma 3 27B IT (Free)" },
    { id: "openai/gpt-oss-120b:free", name: "GPT-OSS 120B (Free)" },
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

export default function SiteSetupPage() {
    const supabase = createClient()
    const router = useRouter()

    const [userEmail, setUserEmail] = useState<string | null>(null)
    const [configs, setConfigs] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [selectedProvider, setSelectedProvider] = useState("openrouter")

    const SelectedProviderIcon = PROVIDERS.find(p => p.id === selectedProvider)?.icon || Shield

    // Form State
    const [formData, setFormData] = useState({
        api_key: "",
        default_model: "openai/gpt-oss-120b:free",
        thinking_model_1: "openai/gpt-oss-120b:free",
        thinking_model_2: "openai/gpt-oss-120b:free",
        fast_model_1: "openai/gpt-oss-120b:free",
        fast_model_2: "openai/gpt-oss-120b:free",
        image_model_1: "openai/gpt-oss-120b:free",
        image_model_2: "openai/gpt-oss-120b:free",
        free_model_1: "openai/gpt-oss-120b:free",
        free_model_2: "openai/gpt-oss-120b:free",
        writer_model: "openai/gpt-oss-120b:free",
        image_metadata_model: "mistralai/mistral-nemo"
    })

    // System Settings State
    const [systemSettings, setSystemSettings] = useState({
        enable_debug: true,
        enable_error: true,
        global_image_provider: "openrouter",
        super_admin_image_provider: "google"
    })

    // Crawl Setup State
    const [serpCrawlSettings, setSerpCrawlSettings] = useState({
        max_h2: 30,
        max_h3: 30,
        max_h4: 20,
        max_h5: 2,
        max_h6: 2
    })

    // Prompt State
    const [prompts, setPrompts] = useState<any[]>([])
    const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null)
    const [promptFormData, setPromptFormData] = useState({
        name: "",
        slug: "",
        system_prompt: "",
        user_prompt_template: "",
        variables: "[]",
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
        fetchConfigs()
        fetchPrompts()
    }

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
                    global_image_provider: sysData.value.global_image_provider ?? "openrouter",
                    super_admin_image_provider: sysData.value.super_admin_image_provider ?? "google"
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
                setFormData({
                    api_key: current.api_key || "",
                    default_model: current.default_model || "openai/gpt-oss-120b:free",
                    thinking_model_1: current.thinking_model_1 || "openai/gpt-oss-120b:free",
                    thinking_model_2: current.thinking_model_2 || "openai/gpt-oss-120b:free",
                    fast_model_1: current.fast_model_1 || "openai/gpt-oss-120b:free",
                    fast_model_2: current.fast_model_2 || "openai/gpt-oss-120b:free",
                    image_model_1: current.image_model_1 || "openai/gpt-oss-120b:free",
                    image_model_2: current.image_model_2 || "openai/gpt-oss-120b:free",
                    free_model_1: current.free_model_1 || "openai/gpt-oss-120b:free",
                    free_model_2: current.free_model_2 || "openai/gpt-oss-120b:free",
                    writer_model: current.writer_model || "openai/gpt-oss-120b:free",
                    image_metadata_model: current.image_metadata_model || "mistralai/mistral-nemo"
                })
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
            is_published: prompt.is_published ?? true
        })
    }

    useEffect(() => {
        const current = configs.find(c => c.provider === selectedProvider)
        if (current) {
            setFormData({
                api_key: current.api_key || "",
                default_model: current.default_model || "openai/gpt-oss-120b:free",
                thinking_model_1: current.thinking_model_1 || "openai/gpt-oss-120b:free",
                thinking_model_2: current.thinking_model_2 || "openai/gpt-oss-120b:free",
                fast_model_1: current.fast_model_1 || "openai/gpt-oss-120b:free",
                fast_model_2: current.fast_model_2 || "openai/gpt-oss-120b:free",
                image_model_1: current.image_model_1 || "openai/gpt-oss-120b:free",
                image_model_2: current.image_model_2 || "openai/gpt-oss-120b:free",
                free_model_1: current.free_model_1 || "openai/gpt-oss-120b:free",
                free_model_2: current.free_model_2 || "openai/gpt-oss-120b:free",
                writer_model: current.writer_model || "openai/gpt-oss-120b:free",
                image_metadata_model: current.image_metadata_model || "mistralai/mistral-nemo"
            })
        } else {
            setFormData({
                api_key: "",
                default_model: "openai/gpt-oss-120b:free",
                thinking_model_1: "openai/gpt-oss-120b:free",
                thinking_model_2: "openai/gpt-oss-120b:free",
                fast_model_1: "openai/gpt-oss-120b:free",
                fast_model_2: "openai/gpt-oss-120b:free",
                image_model_1: "openai/gpt-oss-120b:free",
                image_model_2: "openai/gpt-oss-120b:free",
                free_model_1: "openai/gpt-oss-120b:free",
                free_model_2: "openai/gpt-oss-120b:free",
                writer_model: "openai/gpt-oss-120b:free",
                image_metadata_model: "mistralai/mistral-nemo"
            })
        }
    }, [selectedProvider, configs])

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsSaving(true)
        const toastId = toast.loading("Saving configuration...")

        try {
            if (selectedProvider === 'system_ops') {
                const { error } = await supabase
                    .from("system_settings")
                    .upsert({
                        key: "logging_config",
                        value: systemSettings,
                        updated_at: new Date().toISOString()
                    }, { onConflict: "key" })

                if (error) throw error
                toast.success(`System settings saved!`, { id: toastId })
                if (error) throw error
                toast.success(`Crawl setup saved!`, { id: toastId })
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
                        is_published: promptFormData.is_published,
                        updated_at: new Date().toISOString()
                    }, { onConflict: "slug" })

                if (error) throw error
                toast.success(`Prompt "${promptFormData.name}" saved!`, { id: toastId })
                fetchPrompts()
            } else {
                const { error } = await supabase
                    .from("ai_configurations")
                    .upsert({
                        provider: selectedProvider,
                        api_key: formData.api_key,
                        default_model: formData.default_model,
                        thinking_model_1: formData.thinking_model_1,
                        thinking_model_2: formData.thinking_model_2,
                        fast_model_1: formData.fast_model_1,
                        fast_model_2: formData.fast_model_2,
                        image_model_1: formData.image_model_1,
                        image_model_2: formData.image_model_2,
                        free_model_1: formData.free_model_1,
                        free_model_2: formData.free_model_2,
                        writer_model: formData.writer_model,
                        image_metadata_model: formData.image_metadata_model,
                        updated_at: new Date().toISOString()
                    }, { onConflict: "provider" })

                if (error) throw error
                toast.success(`${selectedProvider.toUpperCase()} configuration saved!`, { id: toastId })
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

                        {selectedProvider !== 'system_ops' && selectedProvider !== 'serp_crawl_setup' && selectedProvider !== 'prompt_setup' && (
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
                            <div className="space-y-6 mt-4 animate-in fade-in duration-300">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium flex items-center gap-2">
                                            <Cpu className="h-4 w-4 text-primary" /> LLM Text Chat Model
                                        </label>
                                        <select
                                            value={formData.default_model}
                                            onChange={(e) => setFormData({ ...formData, default_model: e.target.value })}
                                            className="w-full bg-background border rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-all appearance-none cursor-pointer"
                                        >
                                            {GOOGLE_LLM_MODELS.map((model) => (
                                                <option key={model.id} value={model.id}>{model.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium flex items-center gap-2">
                                            <Cpu className="h-4 w-4 text-primary" /> Text to Image Model
                                        </label>
                                        <select
                                            value={formData.image_model_1}
                                            onChange={(e) => setFormData({ ...formData, image_model_1: e.target.value })}
                                            className="w-full bg-background border rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-all appearance-none cursor-pointer"
                                        >
                                            {GOOGLE_IMAGE_MODELS.map((model) => (
                                                <option key={model.id} value={model.id}>{model.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}

                        {selectedProvider === 'openrouter' && (
                            <div className="space-y-6 mt-4">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium flex items-center gap-2">
                                            <Cpu className="h-4 w-4 text-primary" /> Default AI Model
                                        </label>
                                        <select
                                            value={formData.default_model}
                                            onChange={(e) => setFormData({ ...formData, default_model: e.target.value })}
                                            className="w-full bg-background border rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-all appearance-none cursor-pointer"
                                        >
                                            {OPENROUTER_MODELS.map((model) => (
                                                <option key={model.id} value={model.id}>{model.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium flex items-center gap-2">
                                            <Cpu className="h-4 w-4 text-primary" /> Writer AI Model
                                        </label>
                                        <select
                                            value={formData.writer_model}
                                            onChange={(e) => setFormData({ ...formData, writer_model: e.target.value })}
                                            className="w-full bg-background border rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-all appearance-none cursor-pointer"
                                        >
                                            {OPENROUTER_MODELS.map((model) => (
                                                <option key={model.id} value={model.id}>{model.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium flex items-center gap-2">
                                            <Cpu className="h-4 w-4 text-primary" /> Thinking Model 1
                                        </label>
                                        <select
                                            value={formData.thinking_model_1}
                                            onChange={(e) => setFormData({ ...formData, thinking_model_1: e.target.value })}
                                            className="w-full bg-background border rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-all appearance-none cursor-pointer"
                                        >
                                            {OPENROUTER_MODELS.map((model) => (
                                                <option key={model.id} value={model.id}>{model.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium flex items-center gap-2">
                                            <Cpu className="h-4 w-4 text-primary" /> Thinking Model 2
                                        </label>
                                        <select
                                            value={formData.thinking_model_2}
                                            onChange={(e) => setFormData({ ...formData, thinking_model_2: e.target.value })}
                                            className="w-full bg-background border rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-all appearance-none cursor-pointer"
                                        >
                                            {OPENROUTER_MODELS.map((model) => (
                                                <option key={model.id} value={model.id}>{model.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium flex items-center gap-2">
                                            <Cpu className="h-4 w-4 text-primary" /> Fast Model 1
                                        </label>
                                        <select
                                            value={formData.fast_model_1}
                                            onChange={(e) => setFormData({ ...formData, fast_model_1: e.target.value })}
                                            className="w-full bg-background border rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-all appearance-none cursor-pointer"
                                        >
                                            {OPENROUTER_MODELS.map((model) => (
                                                <option key={model.id} value={model.id}>{model.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium flex items-center gap-2">
                                            <Cpu className="h-4 w-4 text-primary" /> Fast Model 2
                                        </label>
                                        <select
                                            value={formData.fast_model_2}
                                            onChange={(e) => setFormData({ ...formData, fast_model_2: e.target.value })}
                                            className="w-full bg-background border rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-all appearance-none cursor-pointer"
                                        >
                                            {OPENROUTER_MODELS.map((model) => (
                                                <option key={model.id} value={model.id}>{model.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium flex items-center gap-2">
                                            <Cpu className="h-4 w-4 text-primary" /> Image Model 1
                                        </label>
                                        <select
                                            value={formData.image_model_1}
                                            onChange={(e) => setFormData({ ...formData, image_model_1: e.target.value })}
                                            className="w-full bg-background border rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-all appearance-none cursor-pointer"
                                        >
                                            {OPENROUTER_MODELS.map((model) => (
                                                <option key={model.id} value={model.id}>{model.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium flex items-center gap-2">
                                            <Cpu className="h-4 w-4 text-primary" /> Image Model 2
                                        </label>
                                        <select
                                            value={formData.image_model_2}
                                            onChange={(e) => setFormData({ ...formData, image_model_2: e.target.value })}
                                            className="w-full bg-background border rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-all appearance-none cursor-pointer"
                                        >
                                            {OPENROUTER_MODELS.map((model) => (
                                                <option key={model.id} value={model.id}>{model.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium flex items-center gap-2">
                                            <Cpu className="h-4 w-4 text-primary" /> Free Model 1
                                        </label>
                                        <select
                                            value={formData.free_model_1}
                                            onChange={(e) => setFormData({ ...formData, free_model_1: e.target.value })}
                                            className="w-full bg-background border rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-all appearance-none cursor-pointer"
                                        >
                                            {OPENROUTER_MODELS.map((model) => (
                                                <option key={model.id} value={model.id}>{model.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium flex items-center gap-2">
                                            <Cpu className="h-4 w-4 text-primary" /> Free Model 2
                                        </label>
                                        <select
                                            value={formData.free_model_2}
                                            onChange={(e) => setFormData({ ...formData, free_model_2: e.target.value })}
                                            className="w-full bg-background border rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-all appearance-none cursor-pointer"
                                        >
                                            {OPENROUTER_MODELS.map((model) => (
                                                <option key={model.id} value={model.id}>{model.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium flex items-center gap-2">
                                            <Cpu className="h-4 w-4 text-primary" /> Image Metadata Model
                                        </label>
                                        <select
                                            value={formData.image_metadata_model}
                                            onChange={(e) => setFormData({ ...formData, image_metadata_model: e.target.value })}
                                            className="w-full bg-background border rounded-xl px-4 py-3 focus:ring-2 focus:ring-primary outline-none transition-all appearance-none cursor-pointer"
                                        >
                                            {OPENROUTER_MODELS.map((model) => (
                                                <option key={model.id} value={model.id}>{model.name}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
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

                        {selectedProvider !== 'openrouter' && selectedProvider !== 'google' && selectedProvider !== 'serpapi' && selectedProvider !== 'system_ops' && selectedProvider !== 'serp_crawl_setup' && selectedProvider !== 'prompt_setup' && selectedProvider !== 'cloudflare_r2' && (
                            <div className="p-4 mt-4 rounded-2xl bg-amber-500/5 border border-amber-500/10 text-amber-600 dark:text-amber-400 text-xs flex gap-3">
                                <AlertCircle className="h-5 w-5 shrink-0" />
                                <p>Direct provider support is coming soon. Please use <strong>OpenRouter</strong> or <strong>Google</strong> for immediate multi-model functionality.</p>
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

                                        <div className="p-4 rounded-xl border bg-background hover:border-primary/50 transition-colors">
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                <div className="space-y-1">
                                                    <label className="block text-sm font-bold">Global Image Generation Provider</label>
                                                    <p className="text-[11px] text-muted-foreground">The default provider for standard users invoking image generations.</p>
                                                </div>
                                                <select
                                                    value={systemSettings.global_image_provider}
                                                    onChange={(e) => setSystemSettings(s => ({ ...s, global_image_provider: e.target.value }))}
                                                    className="w-full sm:w-1/3 bg-card border rounded-lg px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-primary outline-none cursor-pointer"
                                                >
                                                    {PROVIDERS.filter(p => p.id !== 'system_ops' && p.id !== 'prompt_setup' && p.id !== 'serp_crawl_setup' && p.id !== 'serpapi').map(p => (
                                                        <option key={p.id} value={p.id}>{p.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Super Admin System Setup Configuration */}
                                <div className="space-y-6 pt-4">
                                    <div className="border-b border-border/50 pb-4">
                                        <h3 className="flex items-center gap-2 text-lg font-bold text-foreground">
                                            <Shield className="h-5 w-5 text-orange-500" /> Super Admin System Setup Configuration
                                        </h3>
                                        <p className="text-xs text-muted-foreground mt-1">These settings inherit the global configuration but allow specific overrides exclusively for super admins.</p>
                                    </div>
                                    <div className="grid gap-4">
                                        <div className="p-4 rounded-xl border bg-background hover:border-orange-500/50 transition-colors">
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                                <div className="space-y-1">
                                                    <label className="block text-sm font-bold">Super Admin Image Generation Provider</label>
                                                    <p className="text-[11px] text-muted-foreground">The dedicated provider for super admin workflows and tools.</p>
                                                </div>
                                                <select
                                                    value={systemSettings.super_admin_image_provider}
                                                    onChange={(e) => setSystemSettings(s => ({ ...s, super_admin_image_provider: e.target.value }))}
                                                    className="w-full sm:w-1/3 bg-card border rounded-lg px-4 py-2 text-sm font-medium focus:ring-2 focus:ring-orange-500 outline-none cursor-pointer"
                                                >
                                                    {PROVIDERS.filter(p => p.id !== 'system_ops' && p.id !== 'prompt_setup' && p.id !== 'serp_crawl_setup' && p.id !== 'serpapi').map(p => (
                                                        <option key={p.id} value={p.id}>{p.name}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="pt-4 border-t border-border mt-8 flex justify-end">
                            <button
                                type="submit"
                                disabled={isSaving || (selectedProvider !== 'openrouter' && selectedProvider !== 'google' && selectedProvider !== 'serpapi' && selectedProvider !== 'system_ops' && selectedProvider !== 'serp_crawl_setup' && selectedProvider !== 'prompt_setup' && selectedProvider !== 'cloudflare_r2')}
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
