"use client"

import { useState, useEffect } from "react"
import { Globe, Plus, Loader2, Trash2, ExternalLink, RefreshCw, AlertCircle } from "lucide-react"
import { createClient } from "@/utils/supabase/client"
import { cn } from "@/utils/cn"

export default function BlogsPage() {
    const supabase = createClient()
    const [blogs, setBlogs] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isAdding, setIsAdding] = useState(false)
    const [newBlog, setNewBlog] = useState({ name: "", url: "", wp_api_key: "" })
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        fetchBlogs()
    }, [])

    const fetchBlogs = async () => {
        setIsLoading(true)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data, error } = await supabase
            .from("blogs")
            .select("*")
            .order("created_at", { ascending: false })

        if (error) setError(error.message)
        else setBlogs(data || [])
        setIsLoading(false)
    }

    const triggerSync = async (blogId: string) => {
        setIsLoading(true)
        setError(null)
        try {
            const res = await fetch("/api/blogs/crawl", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ blogId })
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || "Failed to trigger sync")
        } catch (err: any) {
            setError(err.message)
        } finally {
            setIsLoading(false)
        }
    }

    const handleAddBlog = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)
        setError(null)

        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error("Authentication required")

            // Basic URL validation
            const url = newBlog.url.replace(/\/$/, "")

            const { data, error } = await supabase
                .from("blogs")
                .insert([{
                    user_id: user.id,
                    name: newBlog.name,
                    url,
                    wp_api_key: newBlog.wp_api_key
                }])
                .select()

            if (error) throw error

            // Trigger initial crawl job via API route
            await triggerSync(data[0].id)

            setNewBlog({ name: "", url: "", wp_api_key: "" })
            setIsAdding(false)
            fetchBlogs()
        } catch (err: any) {
            setError(err.message || "Failed to add blog")
        } finally {
            setIsLoading(false)
        }
    }

    const handleDeleteBlog = async (id: string) => {
        if (!confirm("Are you sure you want to disconnect this blog? All associated articles will be removed.")) return

        const { error } = await supabase.from("blogs").delete().match({ id })
        if (error) setError(error.message)
        else fetchBlogs()
    }

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Manage Blogs</h1>
                    <p className="text-muted-foreground mt-1">Connect and sync your WordPress sites.</p>
                </div>
                <button
                    onClick={() => setIsAdding(!isAdding)}
                    className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                    {isAdding ? "Cancel" : <><Plus className="h-4 w-4" /> Connect Blog</>}
                </button>
            </div>

            {isAdding && (
                <div className="rounded-2xl border bg-card/50 p-6 backdrop-blur-xl animate-in zoom-in-95 duration-300">
                    <form onSubmit={handleAddBlog} className="grid grid-cols-1 gap-6 md:grid-cols-3">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Blog Name</label>
                            <input
                                required
                                placeholder="My Awesome Blog"
                                value={newBlog.name}
                                onChange={(e) => setNewBlog({ ...newBlog, name: e.target.value })}
                                className="flex h-10 w-full rounded-lg border bg-background/50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">WordPress URL</label>
                            <input
                                required
                                type="url"
                                placeholder="https://example.com"
                                value={newBlog.url}
                                onChange={(e) => setNewBlog({ ...newBlog, url: e.target.value })}
                                className="flex h-10 w-full rounded-lg border bg-background/50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-sm font-medium">Application Password (Optional)</label>
                            <input
                                type="password"
                                placeholder="abcd efgh ijkl mnop"
                                value={newBlog.wp_api_key}
                                onChange={(e) => setNewBlog({ ...newBlog, wp_api_key: e.target.value })}
                                className="flex h-10 w-full rounded-lg border bg-background/50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                            />
                        </div>
                        <div className="md:col-span-3 flex justify-end">
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="rounded-lg bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:opacity-90 disabled:opacity-50"
                            >
                                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save & Sync"}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {error && (
                <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
                    <AlertCircle className="h-4 w-4" />
                    <span>{error}</span>
                </div>
            )}

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {blogs.map((blog) => (
                    <div key={blog.id} className="group relative overflow-hidden rounded-2xl border bg-card p-6 transition-all hover:shadow-2xl hover:shadow-primary/5">
                        <div className="flex items-start justify-between">
                            <div className="rounded-xl bg-primary/10 p-3">
                                <Globe className="h-6 w-6 text-primary" />
                            </div>
                            <div className="flex gap-2 opacity-0 transition-opacity group-hover:opacity-100">
                                <button
                                    onClick={() => handleDeleteBlog(blog.id)}
                                    className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                                >
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            </div>
                        </div>
                        <div className="mt-4">
                            <h3 className="text-lg font-bold">{blog.name}</h3>
                            <p className="text-sm text-muted-foreground flex items-center gap-1">
                                {blog.url}
                                <a href={blog.url} target="_blank" rel="noreferrer" className="hover:text-primary">
                                    <ExternalLink className="h-3 w-3" />
                                </a>
                            </p>
                        </div>
                        <div className="mt-6 flex items-center justify-between border-t pt-4">
                            <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                                Status: <span className="text-emerald-500">Connected</span>
                            </span>
                            <button
                                onClick={() => triggerSync(blog.id)}
                                disabled={isLoading}
                                className="flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50"
                            >
                                <RefreshCw className={cn("h-3 w-3", isLoading && "animate-spin")} /> Sync Now
                            </button>
                        </div>
                    </div>
                ))}

                {!isLoading && blogs.length === 0 && !isAdding && (
                    <div className="col-span-full flex flex-col items-center justify-center rounded-2xl border border-dashed p-12 text-center text-muted-foreground">
                        <Globe className="h-12 w-12 mb-4 opacity-20" />
                        <p className="text-lg font-medium">No blogs connected yet</p>
                        <p className="text-sm mt-1">Connect your first WordPress site to start generating content.</p>
                        <button
                            onClick={() => setIsAdding(true)}
                            className="mt-6 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
                        >
                            Get Started
                        </button>
                    </div>
                )}
            </div>
        </div>
    )
}
