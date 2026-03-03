"use client"

import { useState, useEffect } from "react"
import { FileText, Search, Filter, Loader2, Link as LinkIcon, ExternalLink, Calendar, Database } from "lucide-react"
import { createClient } from "@/utils/supabase/client"
import { cn } from "@/utils/cn"

export default function ArticlesPage() {
    const supabase = createClient()
    const [articles, setArticles] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [searchQuery, setSearchQuery] = useState("")
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        fetchArticles()
    }, [])

    const fetchArticles = async () => {
        setIsLoading(true)
        try {
            const { data, error } = await supabase
                .from("articles")
                .select("*, blogs(name, url)")
                .order("created_at", { ascending: false })

            if (error) throw error
            setArticles(data || [])
        } catch (err: any) {
            setError(err.message)
        } finally {
            setIsLoading(false)
        }
    }

    const filteredArticles = articles.filter(article =>
        article.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        article.blogs?.name?.toLowerCase().includes(searchQuery.toLowerCase())
    )

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Articles & Knowledge</h1>
                    <p className="text-muted-foreground mt-1">All extracted content from your connected blogs.</p>
                </div>
                <div className="relative max-w-sm w-full">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <input
                        placeholder="Search articles or sites..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="flex h-10 w-full rounded-xl border bg-background/50 pl-10 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                    />
                </div>
            </div>

            {error && (
                <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
                    {error}
                </div>
            )}

            {isLoading ? (
                <div className="flex h-64 flex-col items-center justify-center space-y-4">
                    <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">Loading articles...</p>
                </div>
            ) : (
                <div className="rounded-2xl border bg-card overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm border-collapse">
                            <thead>
                                <tr className="border-b bg-muted/30">
                                    <th className="px-6 py-4 font-semibold">Article Title</th>
                                    <th className="px-6 py-4 font-semibold">Source Site</th>
                                    <th className="px-6 py-4 font-semibold">Status</th>
                                    <th className="px-6 py-4 font-semibold">Synced On</th>
                                    <th className="px-6 py-4 font-semibold text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {filteredArticles.map((article) => (
                                    <tr key={article.id} className="group hover:bg-muted/30 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col">
                                                <span className="font-medium line-clamp-1">{article.title}</span>
                                                <span className="text-[10px] text-muted-foreground truncate max-w-[300px]">{article.source_url}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2">
                                                <Database className="h-3 w-3 text-muted-foreground" />
                                                <span>{article.blogs?.name || "Unknown"}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className={cn(
                                                "text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-widest",
                                                article.status === 'published' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-primary/10 text-primary'
                                            )}>
                                                {article.status}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-muted-foreground">
                                            <div className="flex items-center gap-2">
                                                <Calendar className="h-3 w-3" />
                                                {new Date(article.created_at).toLocaleDateString()}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <a
                                                href={article.source_url}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="inline-flex items-center gap-1 text-primary hover:underline"
                                            >
                                                View <ExternalLink className="h-3 w-3" />
                                            </a>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {filteredArticles.length === 0 && (
                        <div className="flex flex-col items-center justify-center p-12 text-center text-muted-foreground">
                            <FileText className="h-12 w-12 mb-4 opacity-20" />
                            <p className="text-lg font-medium">No articles found</p>
                            <p className="text-sm mt-1">Connect a blog and click "Sync Now" to start collecting knowledge.</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
