"use client"

import { useState, useEffect } from "react"
import { Globe, Plus, Loader2, Trash2, ExternalLink, RefreshCw, AlertCircle, Layout, CheckCircle2, Search, X, GripVertical } from "lucide-react"
import { createClient } from "@/utils/supabase/client"
import { cn } from "@/utils/cn"
import { toast } from "sonner"
import Link from "next/link"

// DND Kit Imports
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    horizontalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

// Sortable Item Component
function SortableCountryTag({ id, onRemove }: { id: string; onRemove: (id: string) => void }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging
    } = useSortable({ id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : 'auto',
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-sm font-medium transition-shadow group shrink-0",
                isDragging && "shadow-xl border-primary ring-2 ring-primary/20"
            )}
        >
            <div 
                {...attributes} 
                {...listeners} 
                className="cursor-grab active:cursor-grabbing text-primary/40 hover:text-primary transition-colors -ml-1"
            >
                <GripVertical className="h-3.5 w-3.5" />
            </div>
            <span className="text-primary truncate max-w-[120px]">{id}</span>
            <button
                type="button"
                onClick={() => onRemove(id)}
                className="text-primary/40 hover:text-destructive transition-colors ml-0.5"
            >
                <X className="h-3.5 w-3.5" />
            </button>
        </div>
    );
}

export default function SitesPage() {
    const supabase = createClient()
    const [sites, setSites] = useState<any[]>([])
    const [jobs, setJobs] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isAdding, setIsAdding] = useState(false)
    const [newSite, setNewSite] = useState({
        name: "",
        url: "",
        wp_api_key: "",
        wp_username: "",
        site_type: "wordpress" as "wordpress" | "other",
        site_niche: "",
        custom_niche: "",
        site_description: "",
        target_country: "Global",
        author_name: "",
        author_url: ""
    })
    const [selectedCountries, setSelectedCountries] = useState<string[]>([])
    const [countryInput, setCountryInput] = useState("")
    const [error, setError] = useState<string | null>(null)

    // DND Sensors
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    function handleDragEnd(event: any) {
        const { active, over } = event;

        if (active.id !== over.id) {
            setSelectedCountries((items) => {
                const oldIndex = items.indexOf(active.id);
                const newIndex = items.indexOf(over.id);
                return arrayMove(items, oldIndex, newIndex);
            });
        }
    }

    const addCountry = () => {
        if (!countryInput.trim()) return;
        
        const newCountries = countryInput
            .split(',')
            .map(c => c.trim())
            .filter(c => c && !selectedCountries.includes(c));

        if (newCountries.length > 0) {
            setSelectedCountries([...selectedCountries, ...newCountries]);
            setCountryInput("");
        }
    };

    const removeCountry = (country: string) => {
        setSelectedCountries(selectedCountries.filter(c => c !== country));
    };

    useEffect(() => {
        fetchSites()
        fetchJobs()
        
        const interval = setInterval(fetchJobs, 3000)
        return () => clearInterval(interval)
    }, [])

    const fetchJobs = async () => {
        const { data } = await supabase
            .from("job_queue")
            .select("*")
            .eq("type", "crawl")
            .in("status", ["queued", "processing"])
        
        setJobs(data || [])
    }

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
                    site_type: newSite.site_type,
                    site_niche: newSite.site_niche === 'Others' ? newSite.custom_niche : newSite.site_niche,
                    site_description: newSite.site_description,
                    target_country: selectedCountries.length > 0 ? selectedCountries.join(',') : 'Global',
                    author_name: newSite.author_name,
                    author_url: newSite.author_url
                }])
                .select()

            if (error) throw error

            // Trigger initial crawl job for all sites
            await triggerSync(data[0].id)

            setNewSite({ name: "", url: "", wp_api_key: "", wp_username: "", site_type: "wordpress", site_niche: "", custom_niche: "", site_description: "", target_country: "Global", author_name: "", author_url: "" })
            setSelectedCountries([])
            setCountryInput("")
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

                            <div className="space-y-2">
                                <label className="text-sm font-medium">Site Niche <span className="text-destructive">*</span></label>
                                <select
                                    required
                                    value={newSite.site_niche}
                                    onChange={(e) => setNewSite({ ...newSite, site_niche: e.target.value })}
                                    className="flex h-10 w-full rounded-lg border bg-background/50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                >
                                    <option value="">--Select Site Niche--</option>
                                    <option value="Technology / AI News">Technology / AI News</option>
                                    <option value="Finance / Investing">Finance / Investing</option>
                                    <option value="Health / Medical">Health / Medical</option>
                                    <option value="Food / Recipe">Food / Recipe</option>
                                    <option value="Legal / Law">Legal / Law</option>
                                    <option value="Travel">Travel</option>
                                    <option value="SaaS / Business">SaaS / Business</option>
                                    <option value="News / Editorial">News / Editorial</option>
                                    <option value="Pet Blog">Pet Blog</option>
                                    <option value="Others">Others</option>
                                </select>
                            </div>

                            {newSite.site_niche === 'Others' && (
                                <div className="space-y-2">
                                    <label className="text-sm font-medium">Custom Niche Name <span className="text-destructive">*</span></label>
                                    <input
                                        required
                                        placeholder="e.g. Photography, Education"
                                        value={newSite.custom_niche}
                                        onChange={(e) => setNewSite({ ...newSite, custom_niche: e.target.value })}
                                        className="flex h-10 w-full rounded-lg border bg-background/50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                    />
                                </div>
                            )}

                            <div className="space-y-2 md:col-span-2">
                                <label className="text-sm font-medium">Target Countries (Priority Left to Right)</label>
                                <div className="space-y-3">
                                    <div className="flex flex-wrap gap-2 min-h-[46px] p-2 rounded-xl border bg-background/50">
                                        {selectedCountries.length === 0 ? (
                                            <span className="text-sm text-muted-foreground px-2 py-1.5 italic">No countries added. Defaulting to Global.</span>
                                        ) : (
                                            <DndContext
                                                sensors={sensors}
                                                collisionDetection={closestCenter}
                                                onDragEnd={handleDragEnd}
                                            >
                                                <SortableContext
                                                    items={selectedCountries}
                                                    strategy={horizontalListSortingStrategy}
                                                >
                                                    {selectedCountries.map((country) => (
                                                        <SortableCountryTag key={country} id={country} onRemove={removeCountry} />
                                                    ))}
                                                </SortableContext>
                                            </DndContext>
                                        )}
                                    </div>
                                    <div className="flex gap-2">
                                        <input
                                            placeholder="e.g. USA, UK, AUSTRALIA"
                                            value={countryInput}
                                            onChange={(e) => setCountryInput(e.target.value)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') {
                                                    e.preventDefault();
                                                    addCountry();
                                                }
                                            }}
                                            className="flex h-10 flex-1 rounded-lg border bg-background/50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                        />
                                        <button
                                            type="button"
                                            onClick={addCountry}
                                            className="px-4 py-2 rounded-lg bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/20 transition-colors"
                                        >
                                            Add
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-bold">
                                        {selectedCountries.length > 0 
                                            ? `Priority: ${selectedCountries[0]} is #${1}` 
                                            : "Default priority: Global"}
                                    </p>
                                </div>
                            </div>

                            <div className="space-y-4 md:col-span-2 pt-4 border-t border-border/50">
                                <h4 className="font-bold text-sm text-primary">Article Author Profiles (Optional)</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Post Author Name</label>
                                        <input
                                            placeholder="e.g. John Doe"
                                            value={newSite.author_name}
                                            onChange={(e) => setNewSite({ ...newSite, author_name: e.target.value })}
                                            className="flex h-10 w-full rounded-lg border bg-background/50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-sm font-medium">Author Profile Url</label>
                                        <input
                                            placeholder="https://example.com/author/john"
                                            value={newSite.author_url}
                                            onChange={(e) => setNewSite({ ...newSite, author_url: e.target.value })}
                                            className="flex h-10 w-full rounded-lg border bg-background/50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2 md:col-span-2">
                                <label className="text-sm font-medium">Short Site Description <span className="text-destructive">*</span></label>
                                <textarea
                                    required
                                    placeholder="Enter a brief description of your site..."
                                    value={newSite.site_description}
                                    onChange={(e) => setNewSite({ ...newSite, site_description: e.target.value })}
                                    className="flex min-h-[80px] w-full rounded-lg border bg-background/50 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                                />
                            </div>
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
                                "rounded-xl p-3 transition-transform group-hover:scale-110 flex items-center justify-center relative",
                                site.site_type === 'wordpress' ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                                jobs.some(j => (j.payload as any).blogId === site.id) && "animate-pulse ring-2 ring-primary/20"
                            )}>
                                {jobs.some(j => (j.payload as any).blogId === site.id) ? (
                                    <>
                                        <RefreshCw className="h-6 w-6 animate-spin opacity-20" />
                                        <span className="absolute text-[10px] font-bold">
                                            {jobs.find(j => (j.payload as any).blogId === site.id)?.progress || 0}%
                                        </span>
                                    </>
                                ) : (
                                    <Globe className="h-6 w-6" />
                                )}
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
                            <p className="text-[10px] font-bold text-primary/60 uppercase tracking-widest mt-1">
                                {site.site_niche || "General"}
                            </p>
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
