"use client"

import { useState, useEffect } from "react"
import { useParams, useRouter } from "next/navigation"
import { Globe, ArrowLeft, RefreshCw, Loader2, ExternalLink, FileText, Layout, CheckCircle2, AlertCircle, Database } from "lucide-react"
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

                    <button
                        onClick={triggerSync}
                        className="flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                    >
                        <RefreshCw className="h-4 w-4" /> Force Sync Now
                    </button>
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

            {/* Knowledge Summary Section */}
            <div className="rounded-2xl border bg-primary/5 p-6 border-primary/10">
                <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
                    <Database className="h-5 w-5 text-primary" />
                    Site Intelligence
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="flex justify-between p-3 rounded-lg bg-background/50 border">
                        <span className="text-muted-foreground">Discovery Method</span>
                        <span className="font-semibold">{blog.metadata?.discovery_method || "WordPress REST API"}</span>
                    </div>
                    <div className="flex justify-between p-3 rounded-lg bg-background/50 border">
                        <span className="text-muted-foreground">Original Source</span>
                        <span className="font-semibold text-primary underline truncate max-w-[200px]">{blog.url}</span>
                    </div>
                </div>
            </div>

            {/* Articles List */}
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-bold">Synced Knowledge Base</h2>
                    <p className="text-xs text-muted-foreground">Showing latest {articles.length} articles</p>
                </div>

                <div className="grid grid-cols-1 gap-4">
                    {articles.map((article) => (
                        <div key={article.id} className="group relative overflow-hidden rounded-2xl border bg-card p-5 transition-all hover:shadow-xl hover:shadow-primary/5">
                            <div className="flex items-start justify-between gap-4">
                                <div className="space-y-1">
                                    <h4 className="font-bold group-hover:text-primary transition-colors">{article.title}</h4>
                                    <p className="text-sm text-muted-foreground line-clamp-2" dangerouslySetInnerHTML={{ __html: article.excerpt || "No excerpt available." }} />
                                </div>
                                <span className="text-[10px] font-bold px-2 py-1 rounded bg-accent text-accent-foreground uppercase tracking-widest leading-none">
                                    {article.status}
                                </span>
                            </div>
                            <div className="mt-4 pt-4 border-t flex items-center justify-between text-[10px] text-muted-foreground">
                                <span>Synced on {new Date(article.created_at).toLocaleDateString()}</span>
                                <a
                                    href={article.source_url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-1 hover:text-primary transition-colors"
                                >
                                    Original Post <ExternalLink className="h-2 w-2" />
                                </a>
                            </div>
                        </div>
                    ))}

                    {articles.length === 0 && !isLoading && (
                        <div className="flex flex-col items-center justify-center py-20 border border-dashed rounded-3xl">
                            <FileText className="h-12 w-12 mb-4 opacity-10" />
                            <p className="text-muted-foreground">No articles synced yet.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
