"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Globe, ArrowLeft, RefreshCw, Loader2, ExternalLink, FileText, Layout, CheckCircle2, AlertCircle, Database, Edit, Save, X, Tag, AlignLeft } from "lucide-react"
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
        }
    }, [params.id])

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

            // 2. Fetch Articles
            const { data: articleData, error: articleError } = await supabase
                .from("articles")
                .select("*")
                .eq("blog_id", params.id)
                .order("created_at", { ascending: false })

            if (articleError) throw articleError
            setArticles(articleData || [])
        } catch (err: any) {
            setError(err.message)
            toast.error("Failed to load blog details")
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
        try {
            const res = await fetch("/api/blogs/crawl", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ blogId: params.id })
            })
            if (!res.ok) throw new Error("Failed to trigger sync")
            toast.success("Sync job queued!", { id: toastId })
        } catch (err: any) {
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
                            className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                        >
                            <RefreshCw className="h-4 w-4" /> Force Sync Now
                        </button>
                    </div>
                </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-4 lg:grid-cols-5">
                <div className="rounded-2xl border bg-card/50 p-6 backdrop-blur-sm">
                    <div className="flex items-center gap-3 text-muted-foreground mb-4">
                        <FileText className="h-5 w-5" />
                        <span className="text-sm font-medium">Posts</span>
                    </div>
                    <p className="text-3xl font-bold">{blog.metadata?.post_count || 0}</p>
                </div>
                <div className="rounded-2xl border bg-card/50 p-6 backdrop-blur-sm">
                    <div className="flex items-center gap-3 text-muted-foreground mb-4">
                        <FileText className="h-5 w-5" />
                        <span className="text-sm font-medium">Pages</span>
                    </div>
                    <p className="text-3xl font-bold">{blog.metadata?.page_count || 0}</p>
                </div>
                <div className="rounded-2xl border bg-card/50 p-6 backdrop-blur-sm">
                    <div className="flex items-center gap-3 text-muted-foreground mb-4">
                        <Layout className="h-5 w-5" />
                        <span className="text-sm font-medium">Sitemap</span>
                    </div>
                    <p className="text-3xl font-bold">{blog.metadata?.sitemap_links || 0}</p>
                </div>
                <div className="rounded-2xl border bg-card/50 p-6 backdrop-blur-sm">
                    <div className="flex items-center gap-3 text-muted-foreground mb-4">
                        <RefreshCw className="h-5 w-5 text-indigo-500" />
                        <span className="text-sm font-medium">Last Sync</span>
                    </div>
                    <p className="text-sm font-bold truncate">
                        {blog.metadata?.last_sync ? new Date(blog.metadata.last_sync).toLocaleDateString() : 'Never'}
                    </p>
                </div>
                <div className="rounded-2xl border bg-card/50 p-6 backdrop-blur-sm">
                    <div className="flex items-center gap-3 text-muted-foreground mb-4">
                        <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                        <span className="text-sm font-medium">Status</span>
                    </div>
                    <p className="text-3xl font-bold text-emerald-500">Active</p>
                </div>
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
                    <h2 className="text-xl font-bold">Synced Knowledge Base</h2>
                    <p className="text-xs text-muted-foreground">
                        Showing {Math.min((currentPage * itemsPerPage) - itemsPerPage + 1, articles.length)}-{Math.min(currentPage * itemsPerPage, articles.length)} of {articles.length} articles
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
                                        href={article.source_url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="flex items-center gap-2 py-2 px-5 rounded-xl bg-primary/5 text-primary text-xs font-bold hover:bg-primary hover:text-primary-foreground transition-all group/link"
                                    >
                                        Visit Original Post
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
