"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/utils/supabase/client"
import { 
    FileText, 
    Globe, 
    ExternalLink, 
    RefreshCcw, 
    CheckCircle2, 
    Clock, 
    AlertCircle,
    Search,
    Filter,
    ArrowRightCircle,
    Send
} from "lucide-react"
import { cn } from "@/utils/cn"
import { toast } from "sonner"

export default function PublishingQueuePage() {
    const supabase = createClient()
    const [articles, setArticles] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isPublishing, setIsPublishing] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState("")
    const [activeStatus, setActiveStatus] = useState<string | null>(null)

    const fetchQueue = async () => {
        setIsLoading(true)
        const { data, error } = await supabase
            .from("articles")
            .select(`
                *,
                blogs (
                    name,
                    url,
                    platform
                )
            `)
            .in("status", ["generated", "scheduled", "failed_publish", "published"])
            .order("created_at", { ascending: false })

        if (error) {
            toast.error("Failed to fetch publishing queue")
        } else {
            setArticles(data || [])
        }
        setIsLoading(false)
    }

    useEffect(() => {
        fetchQueue()
    }, [])

    const handleManualPublish = async (articleId: string) => {
        setIsPublishing(articleId)
        const toastId = toast.loading("Queuing for publish...")

        try {
            // Add a job to the job_queue
            const { data: { user } } = await supabase.auth.getUser()
            
            const { error: jobError } = await supabase
                .from("job_queue")
                .insert({
                    user_id: user?.id,
                    type: "publish_article",
                    payload: { article_id: articleId },
                    status: "queued"
                })

            if (jobError) throw jobError

            // Update article status to show it's queued
            await supabase
                .from("articles")
                .update({ status: "scheduled" })
                .eq("id", articleId)

            toast.success("Article queued for publishing!", { id: toastId })
            fetchQueue()
        } catch (err: any) {
            toast.error(err.message, { id: toastId })
        } finally {
            setIsPublishing(null)
        }
    }

    const filteredArticles = articles.filter(a => {
        const matchesSearch = a.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                             a.blogs?.name.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesStatus = activeStatus ? a.status === activeStatus : true;
        return matchesSearch && matchesStatus;
    })

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 text-primary mb-1">
                        <Send className="h-5 w-5" />
                        <span className="text-sm font-bold uppercase tracking-widest">Pipeline Control</span>
                    </div>
                    <h1 className="text-3xl font-extrabold tracking-tight">Publishing Queue</h1>
                    <p className="text-muted-foreground mt-1 text-sm">Review, schedule, and push generated content to your live sites.</p>
                </div>

                <div className="flex items-center gap-3">
                    <button 
                        onClick={fetchQueue}
                        className="p-3 rounded-xl border bg-card hover:bg-accent transition-all text-muted-foreground"
                    >
                        <RefreshCcw className={cn("h-5 w-5", isLoading && "animate-spin text-primary")} />
                    </button>
                </div>
            </div>

            {/* Stats / Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <button 
                    onClick={() => setActiveStatus(activeStatus === 'generated' ? null : 'generated')}
                    className={cn(
                        "p-6 rounded-3xl border bg-card/50 backdrop-blur-sm shadow-sm relative overflow-hidden group transition-all text-left",
                        activeStatus === 'generated' ? "ring-2 ring-primary border-primary/50 bg-primary/5" : "hover:border-primary/30"
                    )}
                >
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform duration-500">
                        <FileText className="h-16 w-16" />
                    </div>
                    <div className="relative z-10">
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">Ready to Publish</p>
                        <p className="text-3xl font-black text-foreground">
                            {articles.filter(a => a.status === 'generated').length}
                        </p>
                    </div>
                </button>
                
                <button 
                    onClick={() => setActiveStatus(activeStatus === 'scheduled' ? null : 'scheduled')}
                    className={cn(
                        "p-6 rounded-3xl border bg-card/50 backdrop-blur-sm shadow-sm relative overflow-hidden group transition-all text-left",
                        activeStatus === 'scheduled' ? "ring-2 ring-amber-500 border-amber-500/50 bg-amber-500/5" : "hover:border-amber-500/30"
                    )}
                >
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform duration-500">
                        <Clock className="h-16 w-16" />
                    </div>
                    <div className="relative z-10">
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">Queued / Scheduled</p>
                        <p className="text-3xl font-black text-amber-500">
                            {articles.filter(a => a.status === 'scheduled').length}
                        </p>
                    </div>
                </button>

                <button 
                    onClick={() => setActiveStatus(activeStatus === 'published' ? null : 'published')}
                    className={cn(
                        "p-6 rounded-3xl border bg-card/50 backdrop-blur-sm shadow-sm relative overflow-hidden group transition-all text-left",
                        activeStatus === 'published' ? "ring-2 ring-emerald-500 border-emerald-500/50 bg-emerald-500/5" : "hover:border-emerald-500/30"
                    )}
                >
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform duration-500">
                        <CheckCircle2 className="h-16 w-16" />
                    </div>
                    <div className="relative z-10">
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">Live Articles</p>
                        <p className="text-3xl font-black text-emerald-500">
                            {articles.filter(a => a.status === 'published').length}
                        </p>
                    </div>
                </button>

                <button 
                    onClick={() => setActiveStatus(activeStatus === 'failed_publish' ? null : 'failed_publish')}
                    className={cn(
                        "p-6 rounded-3xl border bg-card/50 backdrop-blur-sm shadow-sm relative overflow-hidden group transition-all text-left",
                        activeStatus === 'failed_publish' ? "ring-2 ring-destructive border-destructive/50 bg-destructive/5" : "hover:border-destructive/30"
                    )}
                >
                    <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:scale-110 transition-transform duration-500">
                        <AlertCircle className="h-16 w-16" />
                    </div>
                    <div className="relative z-10">
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">Failed Attempts</p>
                        <p className="text-3xl font-black text-destructive">
                            {articles.filter(a => a.status === 'failed_publish').length}
                        </p>
                    </div>
                </button>
            </div>

            {/* Main Table */}
            <div className="bg-card/50 backdrop-blur-sm rounded-3xl border shadow-sm border-border/50 overflow-hidden">
                <div className="p-4 border-b border-border/50 bg-accent/5 flex items-center gap-4">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <input 
                            type="text" 
                            placeholder="Search articles or sites..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-background/50 border rounded-xl pl-9 pr-4 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all font-medium"
                        />
                    </div>
                    <button className="flex items-center gap-2 px-4 py-2 rounded-xl border bg-background hover:bg-accent transition-all text-sm font-bold text-muted-foreground">
                        <Filter className="h-4 w-4" /> Filter
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-accent/5">
                                <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-widest">Article</th>
                                <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-widest">Target Site</th>
                                <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-widest">Status</th>
                                <th className="px-6 py-4 text-xs font-bold text-muted-foreground uppercase tracking-widest text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/50">
                            {isLoading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td colSpan={4} className="px-6 py-8">
                                            <div className="h-4 bg-muted rounded w-3/4 mb-2"></div>
                                            <div className="h-3 bg-muted rounded w-1/4"></div>
                                        </td>
                                    </tr>
                                ))
                            ) : filteredArticles.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-20 text-center">
                                        <div className="flex flex-col items-center gap-4">
                                            <div className="p-4 rounded-full bg-accent/10">
                                                <CheckCircle2 className="h-10 w-10 text-muted-foreground" />
                                            </div>
                                            <div className="space-y-1">
                                                <p className="text-xl font-bold">Queue is Empty</p>
                                                <p className="text-sm text-muted-foreground">All generated content has been processed or is live.</p>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredArticles.map((article) => (
                                    <tr key={article.id} className="hover:bg-accent/5 transition-colors group">
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col max-w-md">
                                                <span className="text-sm font-bold text-foreground line-clamp-1">{article.title}</span>
                                                <div className="flex items-center gap-2 mt-1">
                                                    <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full text-muted-foreground font-mono">ID: {article.id.substring(0, 8)}</span>
                                                    <span className="text-[10px] text-muted-foreground">{new Date(article.created_at).toLocaleDateString()}</span>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="text-sm font-bold flex items-center gap-2">
                                                    <Globe className="h-3 w-3 text-primary" />
                                                    {article.blogs?.name}
                                                </span>
                                                <span className="text-[11px] text-muted-foreground opacity-70">{article.blogs?.url}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-1">
                                                <div className={cn(
                                                    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider w-fit border",
                                                    article.status === 'generated' ? "bg-primary/10 text-primary border-primary/20" :
                                                    article.status === 'scheduled' ? "bg-amber-500/10 text-amber-600 border-amber-500/20" :
                                                    article.status === 'published' ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" :
                                                    "bg-destructive/10 text-destructive border-destructive/20"
                                                )}>
                                                    {article.status === 'generated' && <CheckCircle2 className="h-3 w-3" />}
                                                    {article.status === 'scheduled' && <Clock className="h-3 w-3 animate-pulse" />}
                                                    {article.status === 'published' && <CheckCircle2 className="h-3 w-3" />}
                                                    {article.status === 'failed_publish' && <AlertCircle className="h-3 w-3" />}
                                                    {article.status.replace('_', ' ')}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                {/* Source Link (Live Site) */}
                                                <button 
                                                    className={cn(
                                                        "p-2 rounded-xl transition-all",
                                                        (article.status === 'published' && article.source_url) 
                                                            ? "hover:bg-accent hover:text-primary text-muted-foreground" 
                                                            : "text-muted-foreground/30 cursor-not-allowed shadow-none"
                                                    )}
                                                    title={article.status === 'published' ? "View Live Article" : "Not yet published"}
                                                    disabled={!article.source_url || article.status !== 'published'}
                                                    onClick={() => article.source_url && window.open(article.source_url, '_blank')}
                                                >
                                                    <Globe className={cn("h-4 w-4", article.status === 'published' && "text-emerald-500")} />
                                                </button>

                                                {/* Internal Editor Link */}
                                                <button 
                                                    className={cn(
                                                        "p-2 rounded-xl transition-all",
                                                        article.internal_url 
                                                            ? "hover:bg-accent hover:text-primary text-muted-foreground" 
                                                            : "text-muted-foreground/30 cursor-not-allowed"
                                                    )}
                                                    title="View Internal Editor"
                                                    disabled={!article.internal_url}
                                                    onClick={() => article.internal_url && window.open(article.internal_url, '_blank')}
                                                >
                                                    <ExternalLink className="h-4 w-4" />
                                                </button>

                                                <button 
                                                    onClick={() => handleManualPublish(article.id)}
                                                    disabled={isPublishing === article.id || article.status === 'scheduled'}
                                                    className={cn(
                                                        "flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm ml-2",
                                                        article.status === 'scheduled' 
                                                            ? "bg-amber-500/10 text-amber-600 cursor-not-allowed border border-amber-500/20" 
                                                            : "bg-primary text-primary-foreground hover:shadow-lg hover:shadow-primary/20 active:scale-95"
                                                    )}
                                                >
                                                    {isPublishing === article.id ? (
                                                        <RefreshCcw className="h-3 w-3 animate-spin" />
                                                    ) : (
                                                        <ArrowRightCircle className="h-3 w-3" />
                                                    )}
                                                    {article.status === 'scheduled' ? 'Processing...' : 'Publish'}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    )
}
