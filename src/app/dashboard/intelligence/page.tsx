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

    useEffect(() => {
        fetchBlogs()
    }, [])

    const fetchBlogs = async () => {
        try {
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
                const progress = total > 0 ? Math.round((analyzed / total) * 100) : 0
                statsMap[blog.id] = { total, analyzed, progress }
            })
            setStats(statsMap)
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setIsLoading(false)
        }
    }

    const triggerDeepCrawl = async (blogId: string) => {
        setIsProcessing(blogId)
        const toastId = toast.loading("Starting Site Intelligence Deep Crawl...")

        try {
            // Trigger the job in Supabase
            const { error } = await supabase
                .from('job_queue')
                .insert({
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
                        return (
                            <div key={blog.id} className="group relative overflow-hidden rounded-3xl border bg-card p-6 transition-all hover:shadow-2xl hover:shadow-primary/5 hover:-translate-y-1">
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
                                    <div className="flex justify-between text-xs mb-1">
                                        <span className="text-muted-foreground font-medium">Intelligence Gathering</span>
                                        <span className="text-primary font-bold">{s.progress}%</span>
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
        </div>
    )
}
