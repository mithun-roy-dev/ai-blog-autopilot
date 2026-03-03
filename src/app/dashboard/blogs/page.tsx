"use client"

import { useState, useEffect } from "react"
import { Globe, Plus, Loader2, Trash2, ExternalLink, RefreshCw, AlertCircle, Layout, CheckCircle2, Search } from "lucide-react"
import { createClient } from "@/utils/supabase/client"
import { cn } from "@/utils/cn"
import { toast } from "sonner"
import Link from "next/link"

export default function SitesPage() {
    const supabase = createClient()
    const [sites, setSites] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isAdding, setIsAdding] = useState(false)
    const [newSite, setNewSite] = useState({
        name: "",
        url: "",
        wp_api_key: "",
        wp_username: "",
        site_type: "wordpress" as "wordpress" | "other"
    })
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        fetchSites()
    }, [])

    const fetchSites = async () => {
        setIsLoading(true)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data, error } = await supabase
            .from("blogs")
            .select("*")
            .order("created_at", { ascending: false })

        if (error) setError(error.message)
        else setSites(data || [])
        setIsLoading(false)
    }

    const triggerSync = async (blogId: string) => {
        const toastId = toast.loading("Syncing with WordPress...")
        try {
            const res = await fetch("/api/blogs/crawl", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ blogId })
            })
            const data = await res.json()
            if (!res.ok) throw new Error(data.error || "Failed to trigger sync")
            toast.success("Sync job queued successfully!", { id: toastId })
        } catch (err: any) {
            toast.error(err.message, { id: toastId })
        }
    }

    const handleAddSite = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)
        setError(null)

        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error("Authentication required")

            // Basic URL validation
            const url = newSite.url.replace(/\/$/, "")

            const { data, error } = await supabase
                .from("blogs")
                .insert([{
                    user_id: user.id,
                    name: newSite.name,
                    url,
                    wp_api_key: newSite.site_type === 'wordpress' ? newSite.wp_api_key : null,
                    wp_username: newSite.site_type === 'wordpress' ? newSite.wp_username : null,
                    site_type: newSite.site_type
                }])
                .select()

            if (error) throw error

            // Trigger initial crawl job for all sites
            await triggerSync(data[0].id)

            setNewSite({ name: "", url: "", wp_api_key: "", wp_username: "", site_type: "wordpress" })
            setIsAdding(false)
            fetchSites()
            toast.success(newSite.site_type === 'wordpress' ? "WordPress site connected!" : "Site added!")
        } catch (err: any) {
            setError(err.message || "Failed to add site")
        } finally {
            setIsLoading(false)
        }
    }

    const handleDeleteSite = async (id: string, e: React.MouseEvent) => {
        e.preventDefault()
        e.stopPropagation()
        if (!confirm("Are you sure you want to disconnect this site? All associated articles will be removed.")) return

        const { error } = await supabase.from("blogs").delete().match({ id })
        if (error) setError(error.message)
        else fetchSites()
    }

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Manage Sites</h1>
                    <p className="text-muted-foreground mt-1">Connect your WordPress sites or other resources.</p>
                </div>
                <button
                    onClick={() => setIsAdding(!isAdding)}
                    className="flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                    {isAdding ? "Cancel" : <><Plus className="h-4 w-4" /> Connect New Site</>}
                </button>
            </div>

            {isAdding && (
                <div className="rounded-2xl border bg-card/50 p-6 backdrop-blur-xl animate-in zoom-in-95 duration-300">
                    <form onSubmit={handleAddSite} className="space-y-6">
                        <div className="flex gap-4 p-1 rounded-xl bg-muted/50 w-fit">
                            <button
                                type="button"
                                onClick={() => setNewSite({ ...newSite, site_type: 'wordpress' })}
                                className={cn(
                                    "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                                    newSite.site_type === 'wordpress' ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                WordPress Site
                            </button>
                            <button
                                type="button"
                                onClick={() => setNewSite({ ...newSite, site_type: 'other' })}
                                className={cn(
                                    "px-4 py-2 rounded-lg text-sm font-medium transition-all",
                                    newSite.site_type === 'other' ? "bg-background shadow-sm text-primary" : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                Other Site
                            </button>
                        </div>

                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Site Name</label>
                                <input
                                    required
                                    placeholder="My Awesome Blog"
                                    value={newSite.name}
                                    onChange={(e) => setNewSite({ ...newSite, name: e.target.value })}
                                    className="flex h-10 w-full rounded-lg border bg-background/50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium">Site URL</label>
                                <input
                                    required
                                    type="url"
                                    placeholder="https://example.com"
                                    value={newSite.url}
                                    onChange={(e) => setNewSite({ ...newSite, url: e.target.value })}
                                    className="flex h-10 w-full rounded-lg border bg-background/50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                />
                            </div>

                            {newSite.site_type === 'wordpress' && (
                                <>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">WP Username</label>
                                        <input
                                            required
                                            placeholder="admin"
                                            value={newSite.wp_username}
                                            onChange={(e) => setNewSite({ ...newSite, wp_username: e.target.value })}
                                            className="flex h-10 w-full rounded-lg border bg-background/50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">App Password</label>
                                        <input
                                            required
                                            type="password"
                                            placeholder="abcd efgh ijkl mnop"
                                            value={newSite.wp_api_key}
                                            onChange={(e) => setNewSite({ ...newSite, wp_api_key: e.target.value })}
                                            className="flex h-10 w-full rounded-lg border bg-background/50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                        />
                                    </div>
                                </>
                            )}
                        </div>

                        <div className="flex justify-end">
                            <button
                                type="submit"
                                disabled={isLoading}
                                className="rounded-lg bg-primary px-8 py-2.5 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] disabled:opacity-50"
                            >
                                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (newSite.site_type === 'wordpress' ? "Connect WordPress" : "Add Site")}
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
                {sites.map((site) => (
                    <Link
                        key={site.id}
                        href={`/dashboard/blogs/${site.id}`}
                        className="group relative overflow-hidden rounded-2xl border bg-card p-6 transition-all hover:shadow-2xl hover:shadow-primary/5 hover:-translate-y-1"
                    >
                        <div className="flex items-start justify-between mb-4">
                            <div className={cn(
                                "rounded-xl p-3 transition-transform group-hover:scale-110",
                                site.site_type === 'wordpress' ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
                            )}>
                                <Globe className="h-6 w-6" />
                            </div>
                            <button
                                onClick={(e) => handleDeleteSite(site.id, e)}
                                className="rounded-lg p-2 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                            >
                                <Trash2 className="h-4 w-4" />
                            </button>
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h3 className="text-lg font-bold group-hover:text-primary transition-colors">{site.name}</h3>
                                {site.site_type === 'wordpress' && (
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/10 text-primary uppercase tracking-tighter">WP</span>
                                )}
                            </div>
                            <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                                {site.url}
                                <ExternalLink className="h-3 w-3" />
                            </p>
                        </div>

                        <div className="mt-6 flex items-center justify-between border-t border-dashed pt-4">
                            <div className="flex flex-col">
                                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Type</span>
                                <span className="text-xs font-semibold">{site.site_type === 'wordpress' ? 'WordPress' : 'External'}</span>
                            </div>
                            <div className="flex flex-col text-right">
                                <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-widest">Status</span>
                                <span className="text-xs font-semibold text-emerald-500">Connected</span>
                            </div>
                        </div>
                    </Link>
                ))}

                {sites.length === 0 && !isLoading && (
                    <div className="col-span-full py-20 flex flex-col items-center justify-center border-2 border-dashed rounded-3xl opacity-50">
                        <Globe className="h-12 w-12 mb-4" />
                        <p className="font-medium text-lg">No sites connected yet</p>
                        <p className="text-sm">Add your first WordPress blog to get started.</p>
                    </div>
                )}
            </div>
        </div>
    )
}
