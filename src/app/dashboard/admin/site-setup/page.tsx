"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Settings, Shield, Save, Loader2, AlertCircle, CheckCircle2, Cpu, Globe, Zap, Key, Search } from "lucide-react"
import { createClient } from "@/utils/supabase/client"
import { toast } from "sonner"
import { cn } from "@/utils/cn"

const PROVIDERS = [
    { id: "openrouter", name: "OpenRouter", icon: Globe, description: "Access OpenAI, Anthropic, Google and deepseek via a single API." },
    { id: "openai", name: "OpenAI", icon: Zap, description: "Direct access to GPT-4o, GPT-3.5-Turbo and more." },
    { id: "claude", name: "Claude (Anthropic)", icon: Cpu, description: "High-performance AI with advanced reasoning." },
    { id: "serpapi", name: "SerpAPI", icon: Search, description: "Google Search results for content research and analysis." },
    { id: "serp_crawl_setup", name: "Crawl Setup", icon: Globe, description: "Configure SERP analysis extraction limits." },
    { id: "system_ops", name: "System Operations", icon: Shield, description: "Manage global application settings and operational toggles." },
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
    { id: "deepseek/deepseek-chat", name: "DeepSeek Chat" },
    { id: "openai/gpt-4o", name: "GPT-4o" },
    { id: "meta-llama/llama-3.1-70b-instruct", name: "Llama 3.1 70B" },
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
        default_model: "openai/gpt-oss-120b:free"
    })

    // System Settings State
    const [systemSettings, setSystemSettings] = useState({
        enable_debug: true,
        enable_error: true
    })

    // Crawl Setup State
    const [serpCrawlSettings, setSerpCrawlSettings] = useState({
        max_h2: 30,
        max_h3: 30,
        max_h4: 20,
        max_h5: 2,
        max_h6: 2
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
                    enable_error: sysData.value.enable_error ?? true
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
                    default_model: current.default_model || "openai/gpt-oss-120b:free"
                })
            }
        } catch (err: any) {
            console.error("Error fetching configs:", err)
        } finally {
            setIsLoading(false)
        }
    }

    useEffect(() => {
        const current = configs.find(c => c.provider === selectedProvider)
        if (current) {
            setFormData({
                api_key: current.api_key || "",
                default_model: current.default_model || "openai/gpt-oss-120b:free"
            })
        } else {
            setFormData({
                api_key: "",
                default_model: "openai/gpt-oss-120b:free"
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
            } else if (selectedProvider === 'serp_crawl_setup') {
                const { error } = await supabase
                    .from("system_settings")
                    .upsert({
                        key: "serp_crawl_config",
                        value: serpCrawlSettings,
                        updated_at: new Date().toISOString()
                    }, { onConflict: "key" })

                if (error) throw error
                toast.success(`Crawl setup saved!`, { id: toastId })
            } else {
                const { error } = await supabase
                    .from("ai_configurations")
                    .upsert({
                        provider: selectedProvider,
                        api_key: formData.api_key,
                        default_model: formData.default_model,
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

                        {selectedProvider !== 'system_ops' && selectedProvider !== 'serp_crawl_setup' && (
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

                        {selectedProvider === 'openrouter' && (
                            <div className="space-y-2 mt-4">
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
                        )}

                        {selectedProvider !== 'openrouter' && selectedProvider !== 'serpapi' && selectedProvider !== 'system_ops' && selectedProvider !== 'serp_crawl_setup' && (
                            <div className="p-4 mt-4 rounded-2xl bg-amber-500/5 border border-amber-500/10 text-amber-600 dark:text-amber-400 text-xs flex gap-3">
                                <AlertCircle className="h-5 w-5 shrink-0" />
                                <p>Direct provider support is coming soon. Please use <strong>OpenRouter</strong> for immediate multi-model functionality.</p>
                            </div>
                        )}

                        {selectedProvider === 'system_ops' && (
                            <div className="space-y-6 mt-4">
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
                        )}

                        <div className="pt-4 border-t border-border mt-8 flex justify-end">
                            <button
                                type="submit"
                                disabled={isSaving || (selectedProvider !== 'openrouter' && selectedProvider !== 'serpapi' && selectedProvider !== 'system_ops' && selectedProvider !== 'serp_crawl_setup')}
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
