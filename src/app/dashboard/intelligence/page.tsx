"use client"

import { useState, useEffect } from "react"
import { Globe, Search, RefreshCw, ChevronRight, BrainCircuit, Activity, CheckCircle2, AlertCircle, Loader2, Database, LayoutGrid, List } from "lucide-react"
import { createClient } from "@/utils/supabase/client"
import { toast } from "sonner"
import { cn } from "@/utils/cn"
import Link from "next/link"

export default function SiteIntelligencePage() {
    const supabase = createClient()
    const [blogs, setBlogs] = useState<any[]>([])
    const [stats, setStats] = useState<Record<string, any>>({})
    const [isLoading, setIsLoading] = useState(true)
    const [isProcessing, setIsProcessing] = useState<string | null>(null)
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
    const [selectedBlog, setSelectedBlog] = useState<any | null>(null)
    const [intelligenceData, setIntelligenceData] = useState<any[]>([])
    const [isFetchingDetail, setIsFetchingDetail] = useState(false)

    useEffect(() => {
        fetchBlogs()
    }, [])

    // Real-time polling for processing sites
    useEffect(() => {
        const interval = setInterval(() => {
            const hasProcessing = blogs.some(blog => {
                const intel = blog.metadata?.intelligence
                return intel?.status === 'processing'
            })

            if (hasProcessing || isProcessing) {
                fetchBlogs(true) // Silently refresh
            }
        }, 3000)
        return () => clearInterval(interval)
    }, [blogs, isProcessing])

    const fetchBlogs = async (silent = false) => {
        try {
            if (!silent) setIsLoading(true)
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data, error } = await supabase
                .from('blogs')
                .select('*, articles(count), site_intelligence(count)')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })

            if (error) throw error
            setBlogs(data || [])

            // Calculate progress stats
            const statsMap: Record<string, any> = {}
            data?.forEach(blog => {
                const total = blog.articles?.[0]?.count || 0
                const analyzed = blog.site_intelligence?.[0]?.count || 0
                let progress = total > 0 ? Math.round((analyzed / total) * 100) : 0

                // Real-time metadata override
                const intel = blog.metadata?.intelligence
                if (intel && intel.status === 'processing') {
                    const metaProgress = intel.total > 0 ? Math.round((intel.progress / intel.total) * 100) : 0
                    progress = Math.max(progress, metaProgress)
                }

                statsMap[blog.id] = {
                    total,
                    analyzed,
                    progress,
                    currentUrl: intel?.current_url || '',
                    intelStatus: intel?.status || 'idle'
                }
            })
            setStats(statsMap)
        } catch (error: any) {
            if (!silent) toast.error(error.message)
        } finally {
            if (!silent) setIsLoading(false)
        }
    }

    const triggerDeepCrawl = async (blogId: string) => {
        setIsProcessing(blogId)
        const toastId = toast.loading("Starting Site Intelligence Deep Crawl...")

        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error("User not authenticated")

            // Trigger the job in Supabase
            const { error } = await supabase
                .from('job_queue')
                .insert({
                    user_id: user.id,
                    blog_id: blogId,
                    type: 'intelligence_sync',
                    status: 'queued',
                    payload: { blogId }
                })

            if (error) throw error

            toast.success("Intelligence gathering started! This will take a few minutes to crawl all URLs.", { id: toastId })
        } catch (error: any) {
            toast.error(error.message, { id: toastId })
        } finally {
            setIsProcessing(null)
            // Refresh to show "pending" status if we added it to UI
            setTimeout(fetchBlogs, 2000)
        }
    }

    const fetchIntelligenceData = async (blog: any) => {
        setSelectedBlog(blog)
        setIsFetchingDetail(true)
        try {
            const { data, error } = await supabase
                .from('site_intelligence')
                .select('*')
                .eq('blog_id', blog.id)
                .order('created_at', { ascending: false })

            if (error) throw error
            setIntelligenceData(data || [])
        } catch (error: any) {
            toast.error("Failed to fetch intelligence details")
        } finally {
            setIsFetchingDetail(false)
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
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
                            <BrainCircuit className="h-6 w-6 text-primary" />
                        </div>
                        <h1 className="text-3xl font-bold tracking-tight text-foreground">Create Site Intelligence</h1>
                    </div>
                    <p className="text-muted-foreground">Transform your knowledge base into high-resolution SEO data.</p>
                </div>

                <div className="flex items-center gap-2 p-1 bg-card border rounded-xl w-fit">
                    <button
                        onClick={() => setViewMode('grid')}
                        className={cn("p-2 rounded-lg transition-all", viewMode === 'grid' ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "text-muted-foreground hover:bg-accent")}
                    >
                        <LayoutGrid className="h-4 w-4" />
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        className={cn("p-2 rounded-lg transition-all", viewMode === 'list' ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20" : "text-muted-foreground hover:bg-accent")}
                    >
                        <List className="h-4 w-4" />
                    </button>
                </div>
            </div>

            {blogs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center border-2 border-dashed rounded-3xl bg-card/30">
                    <div className="h-16 w-16 rounded-3xl bg-primary/5 flex items-center justify-center mb-6">
                        <Database className="h-8 w-8 text-primary/40" />
                    </div>
                    <h3 className="text-xl font-bold mb-2">No Sites Found</h3>
                    <p className="text-muted-foreground max-w-sm mb-8">Add your first site to start building deep SEO intelligence.</p>
                    <Link href="/dashboard/blogs" className="px-6 py-3 bg-primary text-white font-bold rounded-2xl shadow-lg shadow-primary/20 hover:scale-[1.05] transition-all">
                        Manage Sites
                    </Link>
                </div>
            ) : (
                <div className={cn(
                    "grid gap-6",
                    viewMode === 'grid' ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3" : "grid-cols-1"
                )}>
                    {blogs.map((blog) => {
                        const s = stats[blog.id] || { total: 0, analyzed: 0, progress: 0 }
                        const isReady = blog.site_intelligence?.[0]?.count > 0
                        return (
                            <div
                                key={blog.id}
                                onClick={() => isReady && fetchIntelligenceData(blog)}
                                className={cn(
                                    "group relative overflow-hidden rounded-3xl border bg-card p-6 transition-all",
                                    isReady ? "cursor-pointer hover:shadow-2xl hover:shadow-primary/10 hover:-translate-y-1" : "opacity-80"
                                )}
                            >
                                <div className="flex items-center gap-4 mb-6">
                                    <div className="h-14 w-14 rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                                        <Globe className="h-7 w-7 text-primary" />
                                    </div>
                                    <div className="overflow-hidden">
                                        <h3 className="font-bold text-lg truncate">{blog.name}</h3>
                                        <p className="text-xs text-muted-foreground truncate">{blog.url}</p>
                                    </div>
                                </div>

                                <div className="space-y-4 mb-8">
                                    <div className="flex justify-between text-[10px] mb-1 overflow-hidden">
                                        <span className="text-muted-foreground font-medium truncate flex-1">
                                            {s.intelStatus === 'processing' ? (
                                                <span className="flex items-center gap-1.5 text-primary animate-pulse">
                                                    <Loader2 className="h-3 w-3 animate-spin" />
                                                    Crawling: {s.currentUrl}
                                                </span>
                                            ) : "Intelligence Gathering"}
                                        </span>
                                        <span className="text-primary font-bold ml-2">{s.progress}%</span>
                                    </div>
                                    <div className="h-2 w-full bg-accent rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-primary transition-all duration-1000"
                                            style={{ width: `${s.progress}%` }}
                                        />
                                    </div>
                                    <div className="flex items-center justify-between pt-2">
                                        <div className="flex items-center gap-2">
                                            <div className="p-1 px-2 rounded-lg bg-accent/50 text-[10px] font-bold text-muted-foreground">
                                                {s.total} URLs Found
                                            </div>
                                            <div className="p-1 px-2 rounded-lg bg-emerald-500/10 text-[10px] font-bold text-emerald-600">
                                                {s.analyzed} Analyzed
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <button
                                    onClick={() => triggerDeepCrawl(blog.id)}
                                    disabled={isProcessing === blog.id}
                                    className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl bg-primary text-white font-bold transition-all hover:shadow-lg hover:shadow-primary/30 active:scale-95 disabled:opacity-50"
                                >
                                    {isProcessing === blog.id ? (
                                        <Loader2 className="h-5 w-5 animate-spin" />
                                    ) : (
                                        <Activity className="h-5 w-5" />
                                    )}
                                    {s.progress === 100 ? "Re-generate Intelligence" : "Generate Site Intelligence"}
                                </button>

                                {blog.site_intelligence?.[0]?.count > 0 && (
                                    <div className="absolute top-4 right-4">
                                        <div className="flex items-center gap-1.5 py-1 px-2.5 rounded-full bg-emerald-500/10 text-emerald-600 text-[10px] font-bold backdrop-blur-sm border border-emerald-500/20">
                                            <CheckCircle2 className="h-3 w-3" />
                                            Ready
                                        </div>
                                    </div>
                                )}
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Info Card */}
            <div className="p-8 rounded-3xl border bg-card/40 backdrop-blur-sm border-white/5 flex flex-col md:flex-row gap-8 items-center text-center md:text-left">
                <div className="h-20 w-20 rounded-3xl bg-secondary flex items-center justify-center shrink-0 border border-white/10 shadow-inner">
                    <Activity className="h-10 w-10 text-primary animate-pulse" />
                </div>
                <div className="space-y-2 max-w-2xl">
                    <h3 className="text-xl font-bold">How Site Intelligence Works</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        Our intelligence engine performs a <span className="text-primary font-bold">Deep Scan</span> of every page and post discovered during sync.
                        It extracts H1-H6 headers, meta-descriptions, word counts, and internal linking structures to build a semantic map of your entire site.
                        This data is critical for our AI to generate content that perfectly matches your topical authority.
                    </p>
                </div>
            </div>
            {/* Intelligence Detail Modal */}
            {selectedBlog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="relative w-full max-w-5xl max-h-[90vh] bg-card border rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-300">
                        {/* Modal Header */}
                        <div className="p-6 border-b flex items-center justify-between bg-muted/30">
                            <div className="flex items-center gap-4">
                                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                                    <Database className="h-6 w-6 text-primary" />
                                </div>
                                <div>
                                    <h2 className="text-xl font-bold">{selectedBlog.name}</h2>
                                    <p className="text-xs text-muted-foreground">{selectedBlog.url}</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedBlog(null)}
                                className="p-2 rounded-xl bg-accent hover:bg-accent/80 transition-colors"
                            >
                                <RefreshCw className="h-5 w-5 rotate-45" />
                            </button>
                        </div>

                        {/* Modal Content */}
                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {isFetchingDetail ? (
                                <div className="flex flex-col items-center justify-center py-20">
                                    <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
                                    <p className="text-muted-foreground">Gathering high-res intel...</p>
                                </div>
                            ) : intelligenceData.length === 0 ? (
                                <div className="text-center py-20">
                                    <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                                    <p className="text-muted-foreground">No intelligence data found for this site yet.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 gap-6">
                                    {/* Summary Stats */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                        <div className="p-4 rounded-2xl bg-accent/30 border border-white/5">
                                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Avg Word Count</p>
                                            <p className="text-2xl font-black text-primary">
                                                {Math.round(intelligenceData.reduce((acc, curr) => acc + (curr.word_count || 0), 0) / intelligenceData.length)}
                                            </p>
                                        </div>
                                        <div className="p-4 rounded-2xl bg-accent/30 border border-white/5">
                                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Internal Links</p>
                                            <p className="text-2xl font-black text-primary">
                                                {intelligenceData.reduce((acc, curr) => acc + (curr.internal_links?.length || 0), 0)}
                                            </p>
                                        </div>
                                        <div className="p-4 rounded-2xl bg-accent/30 border border-white/5">
                                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Schema Types</p>
                                            <p className="text-2xl font-black text-primary">
                                                {new Set(intelligenceData.flatMap(d => d.schema_type?.split(',').map((s: string) => s.trim()) || [])).size}
                                            </p>
                                        </div>
                                        <div className="p-4 rounded-2xl bg-accent/30 border border-white/5">
                                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Analyzed Pages</p>
                                            <p className="text-2xl font-black text-primary">{intelligenceData.length}</p>
                                        </div>
                                    </div>

                                    {/* Pages List */}
                                    <div className="space-y-4">
                                        <h3 className="font-bold text-lg flex items-center gap-2">
                                            <List className="h-5 w-5 text-primary" />
                                            Site Map Intelligence
                                        </h3>
                                        {intelligenceData.map((item) => (
                                            <div key={item.id} className="p-6 rounded-2xl border bg-card/50 hover:bg-card hover:border-primary/20 transition-all">
                                                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-4">
                                                    <div className="space-y-1 flex-1">
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <span className="px-2 py-0.5 rounded-md bg-primary/10 text-primary text-[10px] font-bold uppercase">
                                                                {item.category || 'Standard'}
                                                            </span>
                                                            <span className="text-[10px] text-muted-foreground">
                                                                {new Date(item.last_crawled_at).toLocaleDateString()}
                                                            </span>
                                                        </div>
                                                        <h4 className="font-bold text-lg leading-tight">{item.title}</h4>
                                                        <p className="text-xs text-muted-foreground truncate max-w-md italic">{item.url}</p>
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <div className="px-3 py-1.5 rounded-xl bg-accent text-xs font-bold text-primary">
                                                            {item.word_count} words
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="grid md:grid-cols-2 gap-6 pt-4 border-t border-white/5">
                                                    <div className="space-y-4">
                                                        <div>
                                                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Meta Description</p>
                                                            <p className="text-xs leading-relaxed text-foreground/80 bg-accent/20 p-3 rounded-xl min-h-[50px]">
                                                                {item.meta_description || "No meta description found."}
                                                            </p>
                                                        </div>
                                                        <div>
                                                            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Internal Links ({item.internal_links?.length || 0})</p>
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {item.internal_links?.slice(0, 5).map((link: any, idx: number) => (
                                                                    <div key={idx} className="px-2 py-1 rounded-lg bg-accent text-[9px] text-muted-foreground border border-white/5">
                                                                        {link.text || 'Link'}
                                                                    </div>
                                                                ))}
                                                                {(item.internal_links?.length || 0) > 5 && (
                                                                    <div className="px-2 py-1 rounded-lg bg-primary/5 text-[9px] text-primary border border-primary/10">
                                                                        +{item.internal_links.length - 5} more
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div>
                                                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2 text-emerald-500">Header Hierarchy</p>
                                                        <div className="space-y-1.5 max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
                                                            {item.h1 && (
                                                                <div className="flex items-start gap-2">
                                                                    <span className="text-[9px] font-black text-primary shrink-0 mt-0.5">H1</span>
                                                                    <p className="text-[11px] font-bold truncate">{item.h1}</p>
                                                                </div>
                                                            )}
                                                            {item.h2?.slice(0, 5).map((h: string, idx: number) => (
                                                                <div key={idx} className="flex items-start gap-2 pl-3">
                                                                    <span className="text-[9px] font-bold text-muted-foreground shrink-0 mt-0.5">H2</span>
                                                                    <p className="text-[10px] text-muted-foreground truncate">{h}</p>
                                                                </div>
                                                            ))}
                                                            {(item.h2?.length || 0) > 5 && (
                                                                <p className="text-[9px] text-primary/40 pl-3 italic">+{item.h2.length - 5} more headers...</p>
                                                            )}
                                                            {(!item.h1 && (!item.h2 || item.h2.length === 0)) && (
                                                                <p className="text-[10px] text-muted-foreground italic">No semantic headers found.</p>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Modal Footer */}
                        <div className="p-6 border-t bg-muted/30 flex justify-end">
                            <button
                                onClick={() => setSelectedBlog(null)}
                                className="px-6 py-2.5 rounded-xl bg-primary text-white font-bold text-sm shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all"
                            >
                                Close Intelligence
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
