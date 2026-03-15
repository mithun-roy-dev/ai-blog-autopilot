"use client"

import { useState, useEffect, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import { Globe, ArrowLeft, RefreshCw, Loader2, ExternalLink, FileText, Layout, CheckCircle2, AlertCircle, Database, Edit, Save, X, Tag, AlignLeft, Users, ListTree } from "lucide-react"
import { createClient } from "@/utils/supabase/client"
import { cn } from "@/utils/cn"
import { toast } from "sonner"

export default function BlogDetailPage() {
    const params = useParams()
    const router = useRouter()
    const supabase = createClient()

    const [blog, setBlog] = useState<any>(null)
    const [articles, setArticles] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [isEditing, setIsEditing] = useState(false)
    const [activeTab, setActiveTab] = useState<"post" | "page" | "category" | "author" | "sitemap">("post")
    const [syncProgress, setSyncProgress] = useState(0)
    const [isSyncing, setIsSyncing] = useState(false)
    
    // Refs to avoid stale closures in polling
    const activeTabRef = useRef(activeTab)
    const isSyncingRef = useRef(isSyncing)

    useEffect(() => {
        activeTabRef.current = activeTab
    }, [activeTab])

    const [editData, setEditData] = useState({
        site_niche: "",
        custom_niche: "",
        site_description: ""
    })
    const nicheOptions = [
        "Technology / AI News",
        "Finance / Investing",
        "Health / Medical",
        "Food / Recipe",
        "Legal / Law",
        "Travel",
        "SaaS / Business",
        "News / Editorial",
        "Pet Blog"
    ]

    // Pagination state
    const [currentPage, setCurrentPage] = useState(1)
    const itemsPerPage = 5

    useEffect(() => {
        if (params.id) {
            fetchBlogDetails()
            checkSyncStatus()
            const interval = setInterval(checkSyncStatus, 3000)
            return () => clearInterval(interval)
        }
    }, [params.id])

    const checkSyncStatus = async () => {
        try {
            const { data } = await supabase
                .from("job_queue")
                .select("status, progress")
                .eq("type", "crawl")
                .eq("payload->>blogId", params.id)
                .order("created_at", { ascending: false })
                .limit(1)
            
            const job = data?.[0]
            const stillSyncing = job && (job.status === "queued" || job.status === "processing")
            
            if (job) setSyncProgress(job.progress || 0)

            // Transition: Syncing -> Completed
            if (isSyncingRef.current && !stillSyncing) {
                console.log("[Sync] Job completed, refreshing data...")
                fetchBlogDetails()
                fetchArticles(activeTabRef.current)
                toast.success("Sync completed! Dashboard updated.")
            }

            // Update refs and state
            isSyncingRef.current = !!stillSyncing
            setIsSyncing(!!stillSyncing)
        } catch (err) {
            console.warn("[Sync] Polling error:", err)
        }
    }

    useEffect(() => {
        if (params.id) {
            fetchArticles(activeTab)
        }
    }, [params.id, activeTab])

    const fetchBlogDetails = async () => {
        setIsLoading(true)
        try {
            // 1. Fetch Blog
            const { data: blogData, error: blogError } = await supabase
                .from("blogs")
                .select("*")
                .eq("id", params.id)
                .single()

            if (blogError) throw blogError
            setBlog(blogData)
            setEditData({
                site_niche: nicheOptions.includes(blogData.site_niche) ? blogData.site_niche : (blogData.site_niche ? "Others" : ""),
                custom_niche: nicheOptions.includes(blogData.site_niche) ? "" : (blogData.site_niche || ""),
                site_description: blogData.site_description || ""
            })
        } catch (err: any) {
            setError(err.message)
            toast.error("Failed to load blog details")
        } finally {
            setIsLoading(false)
        }
    }

    const fetchArticles = async (type: string) => {
        setIsLoading(true)
        try {
            if (type === 'post') {
                const { data, error } = await supabase
                    .from("articles")
                    .select("*")
                    .eq("blog_id", params.id)
                    .order("created_at", { ascending: false })

                if (error) throw error
                setArticles(data || [])
            } else {
                const { data, error } = await supabase
                    .from("other_contents")
                    .select("*")
                    .eq("blog_id", params.id)
                    .eq("type", type)
                    .order("created_at", { ascending: false })

                if (error) throw error
                setArticles(data || [])
            }
            setCurrentPage(1)
        } catch (err: any) {
            console.error("Failed to fetch content:", err)
        } finally {
            setIsLoading(false)
        }
    }

    const handleUpdateSite = async () => {
        const toastId = toast.loading("Updating site details...")
        try {
            const finalNiche = editData.site_niche === "Others" ? editData.custom_niche : editData.site_niche
            const { error } = await supabase
                .from("blogs")
                .update({
                    site_niche: finalNiche,
                    site_description: editData.site_description
                })
                .eq("id", params.id)

            if (error) throw error
            
            setBlog({ ...blog, site_niche: finalNiche, site_description: editData.site_description })
            setIsEditing(false)
            toast.success("Site details updated!", { id: toastId })
        } catch (err: any) {
            toast.error(err.message, { id: toastId })
        }
    }

    const triggerSync = async () => {
        const toastId = toast.loading("Triggering sync...")
        setIsSyncing(true)
        isSyncingRef.current = true
        setSyncProgress(0)
        
        try {
            const res = await fetch("/api/blogs/crawl", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ blogId: params.id })
            })
            if (!res.ok) throw new Error("Failed to trigger sync")
            toast.success("Sync job queued!", { id: toastId })
        } catch (err: any) {
            setIsSyncing(false)
            isSyncingRef.current = false
            toast.error(err.message, { id: toastId })
        }
    }

    if (isLoading && !blog) {
        return (
            <div className="flex h-[80vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    if (error || !blog) {
        return (
            <div className="flex flex-col items-center justify-center h-[80vh] space-y-4">
                <AlertCircle className="h-12 w-12 text-destructive" />
                <h2 className="text-xl font-bold">Blog not found</h2>
                <button onClick={() => router.back()} className="text-primary hover:underline">Go back</button>
            </div>
        )
    }

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header */}
            <div className="flex flex-col gap-6">
                <button
                    onClick={() => router.back()}
                    className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors w-fit"
                >
                    <ArrowLeft className="h-4 w-4" /> Back to Sites
                </button>

                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div className="flex items-start gap-4">
                        <div className="rounded-2xl bg-primary/10 p-4 border border-primary/20">
                            <Globe className="h-8 w-8 text-primary" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-bold tracking-tight">{blog.name}</h1>
                            <div className="flex items-center gap-2 mt-1 text-muted-foreground">
                                <span className="text-sm">{blog.url}</span>
                                <a href={blog.url} target="_blank" rel="noreferrer" className="hover:text-primary transition-colors">
                                    <ExternalLink className="h-3 w-3" />
                                </a>
                                {blog.site_type === 'wordpress' && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary uppercase tracking-tighter">WordPress</span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={() => setIsEditing(!isEditing)}
                            className={cn(
                                "flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]",
                                isEditing ? "bg-muted text-foreground" : "bg-secondary text-secondary-foreground"
                            )}
                        >
                            {isEditing ? <><X className="h-4 w-4" /> Cancel</> : <><Edit className="h-4 w-4" /> Edit Details</>}
                        </button>
                        <button
                            onClick={triggerSync}
                            disabled={isSyncing}
                            className={cn(
                                "flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all shadow-lg",
                                isSyncing 
                                    ? "bg-muted text-muted-foreground cursor-not-allowed shadow-none" 
                                    : "bg-primary text-primary-foreground shadow-primary/20 hover:scale-[1.02] active:scale-[0.98]"
                            )}
                        >
                            <RefreshCw className={cn("h-4 w-4", isSyncing && "animate-spin")} />
                            {isSyncing ? `Syncing (${syncProgress}%)` : "Force Sync Now"}
                        </button>
                    </div>
                </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-3 lg:grid-cols-5">
                <button 
                    onClick={() => setActiveTab('post')}
                    className={cn(
                        "rounded-2xl border p-6 backdrop-blur-sm transition-all text-left",
                        activeTab === 'post' ? "bg-primary/10 border-primary ring-1 ring-primary" : "bg-card/50 hover:bg-card/80"
                    )}
                >
                    <div className="flex items-center gap-3 text-muted-foreground mb-4">
                        <FileText className={cn("h-5 w-5", activeTab === 'post' && "text-primary")} />
                        <span className="text-sm font-medium">Posts</span>
                    </div>
                    <p className="text-3xl font-bold">{blog.metadata?.post_count || 0}</p>
                </button>

                <button 
                    onClick={() => setActiveTab('page')}
                    className={cn(
                        "rounded-2xl border p-6 backdrop-blur-sm transition-all text-left",
                        activeTab === 'page' ? "bg-primary/10 border-primary ring-1 ring-primary" : "bg-card/50 hover:bg-card/80"
                    )}
                >
                    <div className="flex items-center gap-3 text-muted-foreground mb-4">
                        <Layout className={cn("h-5 w-5", activeTab === 'page' && "text-primary")} />
                        <span className="text-sm font-medium">Pages</span>
                    </div>
                    <p className="text-3xl font-bold">{blog.metadata?.page_count || 0}</p>
                </button>

                <button 
                    onClick={() => setActiveTab('category')}
                    className={cn(
                        "rounded-2xl border p-6 backdrop-blur-sm transition-all text-left",
                        activeTab === 'category' ? "bg-primary/10 border-primary ring-1 ring-primary" : "bg-card/50 hover:bg-card/80"
                    )}
                >
                    <div className="flex items-center gap-3 text-muted-foreground mb-4">
                        <ListTree className={cn("h-5 w-5", activeTab === 'category' && "text-primary")} />
                        <span className="text-sm font-medium">Categories</span>
                    </div>
                    <p className="text-3xl font-bold">{blog.metadata?.category_count || 0}</p>
                </button>

                <button 
                    onClick={() => setActiveTab('author')}
                    className={cn(
                        "rounded-2xl border p-6 backdrop-blur-sm transition-all text-left",
                        activeTab === 'author' ? "bg-primary/10 border-primary ring-1 ring-primary" : "bg-card/50 hover:bg-card/80"
                    )}
                >
                    <div className="flex items-center gap-3 text-muted-foreground mb-4">
                        <Users className={cn("h-5 w-5", activeTab === 'author' && "text-primary")} />
                        <span className="text-sm font-medium">Authors</span>
                    </div>
                    <p className="text-3xl font-bold">{blog.metadata?.author_count || 0}</p>
                </button>

                <button 
                    onClick={() => setActiveTab('sitemap')}
                    className={cn(
                        "rounded-2xl border p-6 backdrop-blur-sm transition-all text-left",
                        activeTab === 'sitemap' ? "bg-primary/10 border-primary ring-1 ring-primary" : "bg-card/50 hover:bg-card/80"
                    )}
                >
                    <div className="flex items-center gap-3 text-muted-foreground mb-4">
                        <Globe className={cn("h-5 w-5", activeTab === 'sitemap' && "text-primary")} />
                        <span className="text-sm font-medium">Sitemaps</span>
                    </div>
                    <p className="text-3xl font-bold">{blog.metadata?.sitemap_count || 0}</p>
                </button>
            </div>

            {/* Site Profile / Edit Section */}
            <div className="rounded-2xl border bg-card/40 p-6 backdrop-blur-sm border-white/5">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold flex items-center gap-2">
                        <Database className="h-5 w-5 text-primary" />
                        Site Profile
                    </h3>
                    {isEditing && (
                        <button
                            onClick={handleUpdateSite}
                            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:scale-105 transition-all"
                        >
                            <Save className="h-3.5 w-3.5" />
                            Save Changes
                        </button>
                    )}
                </div>

                {isEditing ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                                <Tag className="h-3 w-3" />
                                Site Niche
                            </label>
                            <select
                                value={editData.site_niche}
                                onChange={(e) => setEditData({ ...editData, site_niche: e.target.value })}
                                className="w-full rounded-lg border bg-background/50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                            >
                                <option value="">--Select Site Niche--</option>
                                {nicheOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                <option value="Others">Others</option>
                            </select>
                            {editData.site_niche === 'Others' && (
                                <input
                                    placeholder="Enter custom niche..."
                                    value={editData.custom_niche}
                                    onChange={(e) => setEditData({ ...editData, custom_niche: e.target.value })}
                                    className="w-full mt-2 rounded-lg border bg-background/50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                />
                            )}
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2">
                                <AlignLeft className="h-3 w-3" />
                                Description
                            </label>
                            <textarea
                                value={editData.site_description}
                                onChange={(e) => setEditData({ ...editData, site_description: e.target.value })}
                                className="w-full h-[100px] rounded-lg border bg-background/50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                placeholder="Short site description..."
                            />
                        </div>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div>
                            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2 mb-2">
                                <Tag className="h-3 w-3 text-primary/60" />
                                Targeted Niche
                            </span>
                            <div className="inline-flex items-center px-3 py-1 rounded-full bg-primary/10 text-primary text-sm font-semibold border border-primary/20">
                                {blog.site_niche || "Not specified"}
                            </div>
                        </div>
                        <div>
                            <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-2 mb-2">
                                <AlignLeft className="h-3 w-3 text-primary/60" />
                                Site Overview
                            </span>
                            <p className="text-sm leading-relaxed text-muted-foreground">
                                {blog.site_description || "No description provided for this site."}
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* Articles List */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold">
                        {activeTab === 'post' ? 'Synced Posts' : 
                         activeTab === 'page' ? 'Synced Pages' : 
                         activeTab === 'category' ? 'Synced Categories' : 
                         activeTab === 'author' ? 'Synced Authors' : 'XML Sitemaps'}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                        Showing {Math.min((currentPage * itemsPerPage) - itemsPerPage + 1, articles.length)}-{Math.min(currentPage * itemsPerPage, articles.length)} of {articles.length} {activeTab}s
                    </p>
                </div>

                <div className="grid grid-cols-1 gap-6">
                    {articles.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage).map((article) => (
                        <div key={article.id} className="group relative overflow-hidden rounded-3xl border bg-card/40 p-6 transition-all hover:shadow-2xl hover:shadow-primary/10 hover:-translate-y-1 backdrop-blur-sm border-white/5">
                            <div className="flex flex-col gap-5">
                                <div className="space-y-3">
                                    <div className="flex items-center gap-2 text-[10px] font-bold text-primary/60 uppercase tracking-widest">
                                        <FileText className="h-3 w-3" />
                                        <span>Synced Intelligence</span>
                                    </div>
                                    <h4 className="text-xl font-bold leading-tight group-hover:text-primary transition-colors pr-10">{article.title}</h4>
                                    <p className="text-sm text-muted-foreground/80 line-clamp-2 leading-relaxed" dangerouslySetInnerHTML={{ __html: article.excerpt || "No summary available for this sync point." }} />
                                </div>

                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-5 border-t border-white/5 mt-auto">
                                    <div className="flex items-center gap-4 text-xs font-medium text-muted-foreground">
                                        <div className="flex items-center gap-1.5 py-1.5 px-3 rounded-full bg-accent/50">
                                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                            <span>Synced {new Date(article.created_at).toLocaleDateString()}</span>
                                        </div>
                                    </div>

                                    <a
                                        href={activeTab === 'post' ? article.source_url : article.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex items-center gap-2 py-2 px-5 rounded-xl bg-primary/5 text-primary text-xs font-bold hover:bg-primary hover:text-primary-foreground transition-all group/link"
                                    >
                                        {activeTab === 'sitemap' ? 'Visit Sitemap' : 'Visit Original'}
                                        <ExternalLink className="h-3.5 w-3.5 group-hover/link:translate-x-0.5 group-hover/link:-translate-y-0.5 transition-transform" />
                                    </a>
                                </div>
                            </div>

                            {/* Decorative background element */}
                            <div className="absolute top-0 right-0 -mr-10 -mt-10 h-32 w-32 rounded-full bg-primary/5 blur-3xl group-hover:bg-primary/10 transition-colors" />
                        </div>
                    ))}

                    {articles.length === 0 && !isLoading && (
                        <div className="flex flex-col items-center justify-center py-20 border border-dashed rounded-3xl">
                            <FileText className="h-12 w-12 mb-4 opacity-10" />
                            <p className="text-muted-foreground">No articles synced yet.</p>
                        </div>
                    )}
                </div>

                {/* Pagination Controls */}
                {articles.length > itemsPerPage && (
                    <div className="flex items-center justify-center gap-2 pt-4">
                        <button
                            onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={currentPage === 1}
                            className="px-4 py-2 text-sm font-medium rounded-lg border bg-card hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            Previous
                        </button>
                        <div className="flex items-center gap-1">
                            {Array.from({ length: Math.ceil(articles.length / itemsPerPage) }, (_, i) => i + 1)
                                .filter(page => page === 1 || page === Math.ceil(articles.length / itemsPerPage) || Math.abs(page - currentPage) <= 1)
                                .map((page, index, array) => (
                                    <div key={page} className="flex items-center">
                                        {index > 0 && array[index - 1] !== page - 1 && <span className="px-2 text-muted-foreground">...</span>}
                                        <button
                                            onClick={() => setCurrentPage(page)}
                                            className={cn(
                                                "w-10 h-10 text-sm font-medium rounded-lg transition-all",
                                                currentPage === page
                                                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                                                    : "hover:bg-accent border border-transparent"
                                            )}
                                        >
                                            {page}
                                        </button>
                                    </div>
                                ))}
                        </div>
                        <button
                            onClick={() => setCurrentPage(prev => Math.min(Math.ceil(articles.length / itemsPerPage), prev + 1))}
                            disabled={currentPage === Math.ceil(articles.length / itemsPerPage)}
                            className="px-4 py-2 text-sm font-medium rounded-lg border bg-card hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            Next
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
