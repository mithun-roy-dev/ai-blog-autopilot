"use client"

import { useState, useEffect } from "react"
import { LayoutDashboard, Layers, Loader2, RefreshCw, AlertCircle, FileText, ChevronRight } from "lucide-react"
import { createClient } from "@/utils/supabase/client"
import { cn } from "@/utils/cn"

export default function ClustersPage() {
    const supabase = createClient()
    const [clusters, setClusters] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        fetchClusters()
    }, [])

    const fetchClusters = async () => {
        setIsLoading(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            // For now, we fetch articles and group them by a placeholder cluster field
            // In Task 6, we will implement a proper 'clusters' table if needed, 
            // or use a metadata field in articles.
            const { data: articles, error } = await supabase
                .from("articles")
                .select("*, blogs(name)")
                .order("created_at", { ascending: false })

            if (error) throw error

            // Simple client-side grouping as a placeholder for the actual engine
            const grouped = (articles || []).reduce((acc: any, article: any) => {
                const clusterName = article.cluster || "Uncategorized"
                if (!acc[clusterName]) acc[clusterName] = { name: clusterName, articles: [], blog: article.blogs?.name }
                acc[clusterName].articles.push(article)
                return acc
            }, {})

            setClusters(Object.values(grouped))
        } catch (err: any) {
            setError(err.message)
        } finally {
            setIsLoading(false)
        }
    }

    const triggerRecluster = async () => {
        setIsLoading(true)
        try {
            // This will trigger the Task 6 worker job
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { error } = await supabase
                .from("job_queue")
                .insert([{
                    user_id: user.id,
                    type: "cluster",
                    payload: { mode: "rebuild" },
                    status: "queued"
                }])

            if (error) throw error
            alert("Clustering job queued! The AI engine is now analyzing your articles.")
        } catch (err: any) {
            setError(err.message)
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Content Clusters</h1>
                    <p className="text-muted-foreground mt-1">AI-driven semantic grouping of your articles.</p>
                </div>
                <button
                    onClick={triggerRecluster}
                    disabled={isLoading}
                    className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><RefreshCw className="h-4 w-4" /> Re-cluster All</>}
                </button>
            </div>

            {error && (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    <span>{error}</span>
                </div>
            )}

            {isLoading && clusters.length === 0 ? (
                <div className="flex h-64 flex-col items-center justify-center space-y-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Analyzing content clusters...</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-6">
                    {clusters.map((cluster, i) => (
                        <div key={i} className="group overflow-hidden rounded-2xl border bg-card transition-all hover:shadow-xl hover:shadow-primary/5">
                            <div className="border-b bg-muted/30 px-6 py-4 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <div className="rounded-lg bg-primary/10 p-2">
                                        <Layers className="h-5 w-5 text-primary" />
                                    </div>
                                    <div>
                                        <h3 className="font-bold">{cluster.name}</h3>
                                        <p className="text-[10px] text-muted-foreground uppercase tracking-widest">{cluster.blog || "Global Cluster"}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-4">
                                    <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                                        {cluster.articles.length} Articles
                                    </span>
                                    <ChevronRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                                </div>
                            </div>
                            <div className="p-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {cluster.articles.slice(0, 3).map((article: any) => (
                                        <div key={article.id} className="flex items-start gap-3 rounded-xl border bg-background/50 p-3 text-sm">
                                            <FileText className="h-4 w-4 mt-0.5 text-muted-foreground" />
                                            <span className="truncate flex-1">{article.title}</span>
                                        </div>
                                    ))}
                                    {cluster.articles.length > 3 && (
                                        <div className="flex items-center justify-center rounded-xl border border-dashed p-3 text-xs text-muted-foreground">
                                            +{cluster.articles.length - 3} more articles
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}

                    {clusters.length === 0 && (
                        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed p-12 text-center text-muted-foreground">
                            <Layers className="h-12 w-12 mb-4 opacity-20" />
                            <p className="text-lg font-medium">No clusters generated yet</p>
                            <p className="text-sm mt-1">Connect a blog and sync articles to start semantic clustering.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
