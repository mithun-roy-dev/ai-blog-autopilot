"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Globe, Search, RefreshCw, ChevronRight, Share2, Layers, CheckCircle2, AlertCircle, Loader2, Database, LayoutGrid, List, Plus, Edit3, Trash2, ExternalLink, Zap, FileText } from "lucide-react"
import { createClient } from "@/utils/supabase/client"
import { toast } from "sonner"
import { cn } from "@/utils/cn"
import Link from "next/link"
import { logUI } from "@/utils/logger"

export default function ClustersPage() {
    const router = useRouter()
    const supabase = createClient()
    const [blogs, setBlogs] = useState<any[]>([])
    const [selectedBlog, setSelectedBlog] = useState<any | null>(null)
    const [clusters, setClusters] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [isGenerating, setIsGenerating] = useState(false)
    const [activeJob, setActiveJob] = useState<any | null>(null)
    const [showManualForm, setShowManualForm] = useState(false)
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')

    // Manual Context Form State
    const [manualContext, setManualContext] = useState({
        description: "",
        target_country: "Global"
    })

    // CRUD State
    const [isActionLoading, setIsActionLoading] = useState(false)
    const [editingCluster, setEditingCluster] = useState<any | null>(null)
    const [editingPage, setEditingPage] = useState<any | null>(null)
    const [showClusterModal, setShowClusterModal] = useState(false)
    const [showPageModal, setShowPageModal] = useState(false)

    useEffect(() => {
        fetchBlogs()
    }, [])

    useEffect(() => {
        if (selectedBlog) {
            fetchClusters(selectedBlog.id)
            checkActiveJobs(selectedBlog.id)
        }
    }, [selectedBlog])

    // Real-time job polling
    useEffect(() => {
        if (!selectedBlog || !isGenerating) return

        const interval = setInterval(() => {
            checkActiveJobs(selectedBlog.id)
        }, 3000)

        return () => clearInterval(interval)
    }, [selectedBlog, isGenerating])

    const checkActiveJobs = async (blogId: string) => {
        const { data } = await supabase
            .from('job_queue')
            .select('*')
            .eq('blog_id', blogId)
            .eq('type', 'cluster_generation')
            .in('status', ['queued', 'processing'])
            .order('created_at', { ascending: false })
            .limit(1)

        if (data && data.length > 0) {
            setActiveJob(data[0])
            setIsGenerating(true)
        } else {
            if (activeJob) {
                // Job just finished
                fetchClusters(blogId)
            }
            setActiveJob(null)
            setIsGenerating(false)
        }
    }

    const fetchBlogs = async () => {
        try {
            setIsLoading(true)
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            const { data, error } = await supabase
                .from('blogs')
                .select('*, site_intelligence(count)')
                .eq('user_id', user.id)
                .order('created_at', { ascending: false })

            if (error) throw error
            setBlogs(data || [])
            if (data && data.length > 0 && !selectedBlog) {
                setSelectedBlog(data[0])
            }
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setIsLoading(false)
        }
    }

    const fetchClusters = async (blogId: string) => {
        try {
            const { data, error } = await supabase
                .from('content_clusters')
                .select('*, cluster_pages(*)')
                .eq('blog_id', blogId)
                .order('created_at', { ascending: false })

            if (error) throw error
            setClusters(data || [])
        } catch (error: any) {
            toast.error("Failed to fetch clusters")
        }
    }

    const triggerGeneration = async () => {
        if (!selectedBlog) return

        // If no intelligence data, check if we have manual context
        const hasIntel = selectedBlog.site_intelligence?.[0]?.count > 0
        if (!hasIntel && !manualContext.description) {
            setShowManualForm(true)
            return
        }

        setIsGenerating(true)
        const toastId = toast.loading("Initializing AI content strategy...")

        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error("User not authenticated")

            if (manualContext.description) {
                const newMetadata = {
                    ...(selectedBlog.metadata || {}),
                    description: manualContext.description,
                    target_country: manualContext.target_country
                }
                await supabase.from('blogs').update({ metadata: newMetadata }).eq('id', selectedBlog.id)
            }

            const { error } = await supabase
                .from('job_queue')
                .insert({
                    user_id: user.id,
                    blog_id: selectedBlog.id,
                    type: 'cluster_generation',
                    status: 'queued',
                    payload: { blogId: selectedBlog.id }
                })

            if (error) throw error
            toast.success("Strategy generation started! Monitoring progress...", { id: toastId })
            setShowManualForm(false)
            checkActiveJobs(selectedBlog.id)

        } catch (error: any) {
            toast.error(error.message, { id: toastId })
            setIsGenerating(false)
        }
    }

    // CRUD Handlers
    const handleSaveCluster = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!selectedBlog) return
        setIsActionLoading(true)

        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error("Unauthorized")

            const clusterData = {
                user_id: user.id,
                blog_id: selectedBlog.id,
                topic: editingCluster.topic,
                intent: editingCluster.intent,
                strategy_summary: editingCluster.strategy_summary,
                status: 'completed'
            }

            if (editingCluster.id) {
                const { error } = await supabase
                    .from('content_clusters')
                    .update(clusterData)
                    .eq('id', editingCluster.id)
                if (error) throw error
                toast.success("Cluster updated")
            } else {
                const { error } = await supabase
                    .from('content_clusters')
                    .insert(clusterData)
                if (error) throw error
                toast.success("Cluster created")
            }

            setShowClusterModal(false)
            fetchClusters(selectedBlog.id)
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setIsActionLoading(false)
        }
    }

    const handleSavePage = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsActionLoading(true)

        try {
            const pageData = {
                cluster_id: editingPage.cluster_id,
                title: editingPage.title,
                slug: editingPage.slug,
                type: editingPage.type,
                word_count_target: parseInt(editingPage.word_count_target),
                status: editingPage.status || 'not_generated'
            }

            if (editingPage.id) {
                const { error } = await supabase
                    .from('cluster_pages')
                    .update(pageData)
                    .eq('id', editingPage.id)
                if (error) throw error
                toast.success("Page updated")
            } else {
                const { error } = await supabase
                    .from('cluster_pages')
                    .insert(pageData)
                if (error) throw error
                toast.success("Page added")
            }

            setShowPageModal(false)
            fetchClusters(selectedBlog.id)
        } catch (error: any) {
            toast.error(error.message)
        } finally {
            setIsActionLoading(false)
        }
    }

    const handleDeleteCluster = async (id: string) => {
        if (!confirm("Are you sure? This will delete the cluster and all its articles.")) return
        try {
            const { error } = await supabase.from('content_clusters').delete().eq('id', id)
            if (error) {
                // Check for foreign key constraint violation (Postgres error code 23503)
                if (error.code === '23503' || error.message.includes('violates foreign key constraint')) {
                    // Log the exact error to debug_log.txt on the server
                    await logUI('ERROR', 'Clusters:Delete', `Foreign key violation: ${error.message}`, { clusterId: id });
                    
                    toast.error("🔒 This cluster already has published articles. Please delete or reassign them before removing the cluster.", {
                        duration: 5000
                    });
                    return;
                }
                throw error;
            }
            toast.success("Cluster deleted")
            fetchClusters(selectedBlog.id)
        } catch (error: any) {
            console.error("[Cluster Delete Error]", error);
            logUI('ERROR', 'Clusters:Delete', error.message, { clusterId: id });
            toast.error("Failed to delete cluster. Please try again.");
        }
    }

    const handleDeletePage = async (id: string) => {
        if (!confirm("Are you sure you want to delete this article strategy?")) return
        try {
            const { error } = await supabase.from('cluster_pages').delete().eq('id', id)
            if (error) throw error
            toast.success("Page deleted")
            fetchClusters(selectedBlog.id)
        } catch (error: any) {
            toast.error(error.message)
        }
    }

    const initiateWritingJob = async (page: any, cluster: any) => {
        if (!selectedBlog) return
        const toastId = toast.loading("Checking article status...")

        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) throw new Error("Unauthorized")

            // 1. Check if job already exists for this page_id
            const { data: existingJob, error: checkError } = await supabase
                .from('writing_jobs')
                .select('id')
                .eq('page_id', page.id)
                .maybeSingle()

            if (checkError) throw checkError

            if (existingJob) {
                toast.error("This article already in write job", { id: toastId })
                return
            }

            // 2. If status is 'published', check for existing article
            if (page.status === 'published') {
                const { data: matchedArticle, error: searchError } = await supabase
                    .from('articles')
                    .select('id')
                    .eq('slug', page.slug)
                    .eq('blog_id', selectedBlog.id)
                    .maybeSingle()

                if (searchError) throw searchError

                if (matchedArticle) {
                    // Update Article with cluster_id
                    await supabase
                        .from('articles')
                        .update({ cluster_id: cluster.id })
                        .eq('id', matchedArticle.id)

                    // Update Cluster Page with article_id
                    await supabase
                        .from('cluster_pages')
                        .update({ article_id: matchedArticle.id })
                        .eq('id', page.id)

                    toast.success("Article already published on site!", { id: toastId })
                    fetchClusters(selectedBlog.id)
                    return
                } else {
                    // Fallback: Not found in database, mark as not_generated and proceed to queue
                    await supabase
                        .from('cluster_pages')
                        .update({ status: 'not_generated' })
                        .eq('id', page.id)
                    
                    toast.info("Article not found in database. Starting generation...", { id: toastId })
                    // Continue to step 2...
                }
            }

            // 3. Create writing job
            const primaryKeyword = (page.slug || "").replace(/^\/+/, "").split('/').pop()?.replace(/-/g, ' ') || ""

            const { error: jobError } = await supabase
                .from('writing_jobs')
                .insert({
                    user_id: user.id,
                    blog_id: selectedBlog.id,
                    cluster_id: cluster.id,
                    page_id: page.id,
                    title: page.title,
                    slug: page.slug,
                    primary_keyword: primaryKeyword,
                    status: 'awaiting_start'
                })

            if (jobError) throw jobError

            toast.success("Article added to writing queue!", { id: toastId })
            fetchClusters(selectedBlog.id)
        } catch (error: any) {
            toast.error(error.message, { id: toastId })
        }
    }

    if (isLoading) {
        return (
            <div className="flex h-[80vh] items-center justify-center">
                <div className="relative">
                    <div className="h-12 w-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                    <Layers className="h-5 w-5 text-primary absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            {/* Header Area */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-card/40 p-6 rounded-[2rem] border border-border/50 backdrop-blur-sm">
                <div className="flex items-center gap-5">
                    <div className="h-14 w-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-xl shadow-indigo-500/20">
                        <Layers className="h-7 w-7 text-white" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-black tracking-tight text-foreground">Topical Authority</h1>
                        <p className="text-sm text-muted-foreground font-medium">Map out your content strategy with AI Clusters.</p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex flex-col items-end mr-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-1">Active Property</span>
                        <select
                            value={selectedBlog?.id}
                            onChange={(e) => setSelectedBlog(blogs.find(b => b.id === e.target.value))}
                            className="bg-background border rounded-xl px-4 py-2 font-bold text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all cursor-pointer min-w-[200px] shadow-sm"
                        >
                            {blogs.map(blog => (
                                <option key={blog.id} value={blog.id}>{blog.name}</option>
                            ))}
                        </select>
                    </div>

                    <button
                        onClick={triggerGeneration}
                        disabled={isGenerating}
                        className={cn(
                            "group relative flex items-center gap-3 px-7 py-3 rounded-2xl font-black text-sm transition-all overflow-hidden",
                            isGenerating
                                ? "bg-amber-500/10 text-amber-600 border border-amber-500/20 cursor-wait"
                                : "bg-primary text-white shadow-lg shadow-primary/30 hover:scale-[1.02] hover:shadow-primary/40 active:scale-95"
                        )}
                    >
                        {isGenerating ? (
                            <>
                                <RefreshCw className="h-4 w-4 animate-spin" />
                                <span>AI Brainstorming...</span>
                            </>
                        ) : (
                            <>
                                <Zap className="h-4 w-4 group-hover:fill-amber-300 transition-all" />
                                <span>{clusters.length > 0 ? "Refresh Strategy" : "Generate Strategy"}</span>
                            </>
                        )}
                    </button>

                    <button
                        onClick={() => {
                            setEditingCluster({ topic: "", intent: "Informational", strategy_summary: "" })
                            setShowClusterModal(true)
                        }}
                        className="p-3 bg-card border rounded-2xl hover:bg-accent transition-all shadow-sm"
                        title="Add Manual Cluster"
                    >
                        <Plus className="h-5 w-5" />
                    </button>
                </div>
            </div>

            {/* Work in Progress Banner */}
            {activeJob && (
                <div className="relative overflow-hidden group p-6 rounded-3xl bg-amber-500/5 border border-amber-500/20 animate-in slide-in-from-top-4 duration-500">
                    <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                        <Zap className="h-24 w-24 text-amber-500" />
                    </div>
                    <div className="flex items-center gap-5 relative z-10">
                        <div className="h-12 w-12 rounded-2xl bg-amber-500/10 flex items-center justify-center">
                            <RefreshCw className="h-5 w-5 text-amber-500 animate-spin" />
                        </div>
                        <div className="flex-1">
                            <div className="flex items-center gap-3 mb-1">
                                <h4 className="font-black text-amber-700">Strategy Engine in Progress</h4>
                                <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-[10px] font-black uppercase text-amber-600 animate-pulse">
                                    {activeJob.status}
                                </span>
                            </div>
                            <p className="text-sm text-amber-600/80 font-medium leading-relaxed max-w-2xl">
                                Our AI is currently analyzing your site's intelligence data and existing categories to architect a high-authority content strategy.
                                This usually takes 20-40 seconds. New clusters will appear below as they complete.
                            </p>
                        </div>
                        <div className="hidden md:block">
                            <div className="flex gap-1">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="h-1 w-8 rounded-full bg-amber-500/20 overflow-hidden">
                                        <div className="h-full bg-amber-500 animate-[loading_1.5s_infinite]" style={{ animationDelay: `${i * 0.2}s` }} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Clusters Display */}
            {clusters.length === 0 && !isGenerating ? (
                <div className="flex flex-col items-center justify-center py-32 text-center border-2 border-dashed rounded-[3rem] bg-card/20 border-border/50 group hover:bg-card/30 transition-all">
                    <div className="relative mb-8">
                        <div className="absolute inset-0 bg-primary/10 blur-3xl rounded-full group-hover:bg-primary/20 transition-all duration-500" />
                        <div className="relative h-24 w-24 rounded-3xl bg-gradient-to-br from-background to-accent border flex items-center justify-center shadow-xl group-hover:scale-110 transition-all duration-500">
                            <Share2 className="h-10 w-10 text-primary/60 group-hover:text-primary transition-colors" />
                        </div>
                    </div>
                    <h3 className="text-3xl font-black mb-3">Your Content Roadmap Awaits</h3>
                    <p className="text-muted-foreground max-w-sm mb-10 font-medium leading-relaxed text-lg">
                        You haven't initialized your SEO strategy yet. Let our AI architect a high-authority cluster map for your blog.
                    </p>
                    <div className="flex flex-col sm:flex-row gap-4">
                        <button onClick={triggerGeneration} className="px-10 py-4 bg-primary text-white font-black rounded-2xl shadow-xl shadow-primary/30 hover:scale-[1.05] hover:shadow-primary/40 active:scale-95 transition-all flex items-center gap-3">
                            <Zap className="h-5 w-5 fill-amber-300" />
                            Build AI Strategy
                        </button>
                        <button
                            onClick={() => {
                                setEditingCluster({ topic: "", intent: "Informational", strategy_summary: "" })
                                setShowClusterModal(true)
                            }}
                            className="px-10 py-4 bg-card border border-border font-black rounded-2xl hover:bg-accent hover:border-border/80 transition-all flex items-center gap-3 shadow-sm"
                        >
                            <Plus className="h-5 w-5 text-muted-foreground" />
                            Manual Entry
                        </button>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-16 pb-20">
                    {clusters.map((cluster) => (
                        <div key={cluster.id} className="group/cluster space-y-6">
                            {/* Cluster Header */}
                            <div className="relative p-1 rounded-[2.5rem] bg-gradient-to-br from-indigo-500/20 via-transparent to-purple-500/20 shadow-lg">
                                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 p-8 rounded-[2.4rem] bg-card/90 backdrop-blur-md">
                                    <div className="space-y-4">
                                        <div className="flex items-center gap-3">
                                            <span className="px-4 py-1.5 rounded-xl bg-indigo-500/10 text-indigo-600 text-xs font-black uppercase tracking-widest border border-indigo-500/20 shadow-sm">
                                                {cluster.intent || 'Transactional'}
                                            </span>
                                            <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground/60 px-3 py-1.5 bg-accent/50 rounded-xl">
                                                <Database className="h-3 w-3" />
                                                <span>{cluster.cluster_pages?.length || 0} Articles Strategy</span>
                                            </div>
                                        </div>
                                        <div>
                                            <h2 className="text-4xl font-black text-foreground mb-2 group-hover/cluster:text-indigo-600 transition-colors uppercase tracking-tight">{cluster.topic}</h2>
                                            <div className="flex items-start gap-3 p-4 bg-indigo-500/5 rounded-2xl border border-indigo-500/10">
                                                <div className="p-1.5 bg-indigo-500/10 rounded-lg shrink-0 mt-0.5">
                                                    <ChevronRight className="h-3 w-3 text-indigo-500" />
                                                </div>
                                                <p className="text-sm font-medium text-indigo-700/80 leading-relaxed italic">{cluster.strategy_summary}</p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 pb-2">
                                        <button
                                            onClick={() => {
                                                setEditingCluster(cluster)
                                                setShowClusterModal(true)
                                            }}
                                            className="h-12 w-12 rounded-2xl bg-card border border-border/50 flex items-center justify-center hover:bg-accent hover:border-border transition-all shadow-sm"
                                        >
                                            <Edit3 className="h-5 w-5 text-muted-foreground" />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteCluster(cluster.id)}
                                            className="h-12 w-12 rounded-2xl bg-red-500/[0.03] border border-red-500/10 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all group/del shadow-sm"
                                        >
                                            <Trash2 className="h-5 w-5 text-red-500/40 group-hover/del:text-white" />
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Pages Area */}
                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pl-4">
                                <div className="lg:col-span-1 flex flex-col items-center pt-8 hidden lg:flex">
                                    <div className="h-full w-0.5 bg-gradient-to-b from-indigo-500/50 to-transparent rounded-full" />
                                </div>

                                <div className="lg:col-span-11 space-y-4">
                                    {cluster.cluster_pages?.map((page: any, idx: number) => (
                                        <div
                                            key={page.id}
                                            className="group/page relative flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-3xl bg-card border border-border/40 hover:border-indigo-500/30 hover:shadow-xl hover:shadow-indigo-500/5 transition-all duration-300"
                                            style={{ animationDelay: `${idx * 100}ms` }}
                                        >
                                            <div className="flex items-center gap-5 flex-1">
                                                <div className={cn(
                                                    "h-12 w-12 rounded-2xl shrink-0 flex items-center justify-center font-black text-xs shadow-inner",
                                                    page.type === 'pillar' ? "bg-amber-500/10 text-amber-600 border border-amber-500/20" : "bg-blue-500/10 text-blue-600 border border-blue-500/20"
                                                )}>
                                                    {page.type === 'pillar' ? 'P' : 'S'}
                                                </div>
                                                <div>
                                                    <h4 className="font-bold text-lg text-foreground group-hover/page:text-indigo-600 transition-colors">{page.title}</h4>
                                                    <div className="flex items-center gap-3 mt-1.5 font-mono text-[10px] text-muted-foreground">
                                                        <span className="bg-accent px-2 py-0.5 rounded-md">{page.slug}</span>
                                                        <span className="flex items-center gap-1">
                                                            <div className="h-1 w-1 rounded-full bg-border" />
                                                            {page.word_count_target} words
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-4">
                                                <div className={cn(
                                                    "px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-wider flex items-center gap-2 border",
                                                    page.status === 'published' ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" :
                                                        page.status === 'generated' ? "bg-amber-500/10 text-amber-600 border-amber-500/20" :
                                                            "bg-accent/50 text-muted-foreground/60 border-border/20"
                                                )}>
                                                    <div className={cn(
                                                        "h-2 w-2 rounded-full",
                                                        page.status === 'published' ? "bg-emerald-500" :
                                                            page.status === 'generated' ? "bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]" :
                                                                "bg-muted-foreground/20"
                                                    )} />
                                                    {page.status === 'not_generated' ? 'Write' : page.status.charAt(0).toUpperCase() + page.status.slice(1).replace('_', ' ')}
                                                </div>

                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => {
                                                            setEditingPage(page)
                                                            setShowPageModal(true)
                                                        }}
                                                        className="p-2.5 rounded-xl bg-accent/50 hover:bg-accent hover:text-indigo-600 transition-all text-muted-foreground"
                                                        title="Edit Strategy"
                                                    >
                                                        <Edit3 className="h-4 w-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => initiateWritingJob(page, cluster)}
                                                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-500 text-white font-black text-xs hover:bg-indigo-600 hover:scale-[1.05] shadow-lg shadow-indigo-500/20 active:scale-95 transition-all"
                                                    >
                                                        <Plus className="h-3.5 w-3.5" />
                                                        Write
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}

                                    <button
                                        onClick={() => {
                                            setEditingPage({ cluster_id: cluster.id, title: "", slug: "", type: "supporting", word_count_target: 1200 })
                                            setShowPageModal(true)
                                        }}
                                        className="w-full flex items-center justify-center gap-3 py-6 border-2 border-dashed rounded-[2rem] text-muted-foreground/60 hover:text-indigo-600 hover:border-indigo-500/40 hover:bg-indigo-500/5 hover:shadow-lg transition-all font-black text-sm uppercase tracking-widest mt-4"
                                    >
                                        <Plus className="h-5 w-5" /> Add Support Article
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}

                    <div className="flex pt-10">
                        <button
                            onClick={() => {
                                setEditingCluster({ topic: "", intent: "Informational", strategy_summary: "" })
                                setShowClusterModal(true)
                            }}
                            className="w-full group relative overflow-hidden flex items-center justify-center gap-4 py-12 rounded-[3rem] bg-indigo-500/[0.02] border-2 border-dashed border-indigo-500/20 hover:border-indigo-500/40 hover:bg-indigo-500/[0.05] transition-all"
                        >
                            <div className="absolute inset-0 bg-indigo-500/5 translate-y-full group-hover:translate-y-0 transition-transform duration-500" />
                            <div className="relative flex flex-col items-center gap-4">
                                <div className="h-16 w-16 rounded-3xl bg-indigo-500/10 flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300">
                                    <Plus className="h-8 w-8 text-indigo-500" />
                                </div>
                                <span className="text-2xl font-black text-indigo-600/60 group-hover:text-indigo-600 transition-colors uppercase tracking-tight">Expand Your Topical Authority</span>
                            </div>
                        </button>
                    </div>
                </div>
            )}

            {/* Manual Context Modal */}
            {showManualForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-300">
                    <div className="w-full max-w-lg bg-card border rounded-3xl shadow-2xl p-8 space-y-6 animate-in zoom-in-95">
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-2xl bg-amber-500/10 text-amber-500">
                                <AlertCircle className="h-6 w-6" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold">Additional Context Needed</h3>
                                <p className="text-sm text-muted-foreground">Since this site hasn't been crawled yet, we need a bit of info.</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-sm font-bold opacity-70">Site Description</label>
                                <textarea
                                    value={manualContext.description}
                                    onChange={(e) => setManualContext({ ...manualContext, description: e.target.value })}
                                    className="w-full bg-background border rounded-2xl p-4 h-32 outline-none focus:ring-2 focus:ring-primary/20 transition-all text-sm"
                                    placeholder="e.g., A blog about sustainable gardening and permaculture for urban environments."
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-bold opacity-70">Target Country/Language</label>
                                <input
                                    type="text"
                                    value={manualContext.target_country}
                                    onChange={(e) => setManualContext({ ...manualContext, target_country: e.target.value })}
                                    className="w-full bg-background border rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20 transition-all text-sm font-medium"
                                    placeholder="e.g., United States / English"
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 pt-4">
                            <button
                                onClick={() => setShowManualForm(false)}
                                className="flex-1 py-3 rounded-xl bg-accent font-bold text-sm transition-all hover:bg-accent/80"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={triggerGeneration}
                                className="flex-1 py-3 rounded-xl bg-primary text-white font-bold text-sm shadow-lg shadow-primary/20 transition-all hover:scale-[1.02]"
                            >
                                Start Generation
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Cluster Creation/Edit Modal */}
            {showClusterModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-300">
                    <form onSubmit={handleSaveCluster} className="w-full max-w-lg bg-card border rounded-3xl shadow-2xl p-8 space-y-6 animate-in zoom-in-95">
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-500">
                                <Layers className="h-6 w-6" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold">{editingCluster?.id ? 'Edit Cluster' : 'New Content Cluster'}</h3>
                                <p className="text-sm text-muted-foreground">Define a high-level topic for your SEO pillar.</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase tracking-widest opacity-50 pl-1">Topic Name</label>
                                <input
                                    required
                                    value={editingCluster.topic}
                                    onChange={(e) => setEditingCluster({ ...editingCluster, topic: e.target.value })}
                                    className="w-full bg-background border rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-bold"
                                    placeholder="e.g., Urban Permaculture"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase tracking-widest opacity-50 pl-1">Intent</label>
                                    <select
                                        value={editingCluster.intent}
                                        onChange={(e) => setEditingCluster({ ...editingCluster, intent: e.target.value })}
                                        className="w-full bg-background border rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20 transition-all text-sm appearance-none"
                                    >
                                        <option value="Informational">Informational</option>
                                        <option value="Commercial">Commercial</option>
                                        <option value="Transactional">Transactional</option>
                                        <option value="Navigational">Navigational</option>
                                    </select>
                                </div>
                                <div className="space-y-1 text-right">
                                    <label className="text-[10px] font-black uppercase tracking-widest opacity-50 pr-1">Status</label>
                                    <div className="px-4 py-3 bg-emerald-500/10 text-emerald-500 rounded-xl text-xs font-bold text-center">Active</div>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase tracking-widest opacity-50 pl-1">Strategy Summary</label>
                                <textarea
                                    required
                                    value={editingCluster.strategy_summary}
                                    onChange={(e) => setEditingCluster({ ...editingCluster, strategy_summary: e.target.value })}
                                    className="w-full bg-background border rounded-2xl p-4 h-24 outline-none focus:ring-2 focus:ring-primary/20 transition-all text-sm leading-relaxed"
                                    placeholder="Explain the SEO goal for this cluster..."
                                />
                            </div>
                        </div>

                        <div className="flex gap-3 pt-4 border-t">
                            <button
                                type="button"
                                onClick={() => setShowClusterModal(false)}
                                className="flex-1 py-3 rounded-xl bg-accent font-bold text-sm transition-all hover:bg-accent/80"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isActionLoading}
                                className="flex-1 py-3 rounded-xl bg-primary text-white font-bold text-sm shadow-lg shadow-primary/30 transition-all hover:scale-[1.02] flex items-center justify-center gap-2"
                            >
                                {isActionLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                                {editingCluster?.id ? 'Save Changes' : 'Create Cluster'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {/* Page Creation/Edit Modal */}
            {showPageModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-300">
                    <form onSubmit={handleSavePage} className="w-full max-w-lg bg-card border rounded-3xl shadow-2xl p-8 space-y-6 animate-in zoom-in-95">
                        <div className="flex items-center gap-4">
                            <div className="p-3 rounded-2xl bg-indigo-500/10 text-indigo-500">
                                <FileText className="h-6 w-6" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold">{editingPage?.id ? 'Edit Article strategy' : 'Add New Article'}</h3>
                                <p className="text-sm text-muted-foreground">Map out the title and SEO target for this page.</p>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase tracking-widest opacity-50 pl-1">Article Title</label>
                                <input
                                    required
                                    value={editingPage.title}
                                    onChange={(e) => setEditingPage({ ...editingPage, title: e.target.value })}
                                    className="w-full bg-background border rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-bold"
                                    placeholder="e.g., 10 Tips for Thriving Urban Permaculture"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black uppercase tracking-widest opacity-50 pl-1">Slug</label>
                                <input
                                    required
                                    value={editingPage.slug}
                                    onChange={(e) => setEditingPage({ ...editingPage, slug: e.target.value })}
                                    className="w-full bg-background border rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20 transition-all font-mono text-sm"
                                    placeholder="/urban-permaculture-tips"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase tracking-widest opacity-50 pl-1">Type</label>
                                    <select
                                        value={editingPage.type}
                                        onChange={(e) => setEditingPage({ ...editingPage, type: e.target.value })}
                                        className="w-full bg-background border rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20 transition-all text-sm appearance-none"
                                    >
                                        <option value="pillar">Pillar Content</option>
                                        <option value="supporting">Supporting Article</option>
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black uppercase tracking-widest opacity-50 pl-1">Target Words</label>
                                    <input
                                        type="number"
                                        required
                                        value={editingPage.word_count_target}
                                        onChange={(e) => setEditingPage({ ...editingPage, word_count_target: e.target.value })}
                                        className="w-full bg-background border rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary/20 transition-all text-sm font-bold"
                                        placeholder="1200"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-3 pt-4 border-t">
                            <button
                                type="button"
                                onClick={() => setShowPageModal(false)}
                                className="flex-1 py-3 rounded-xl bg-accent font-bold text-sm transition-all hover:bg-accent/80"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={isActionLoading}
                                className="flex-1 py-3 rounded-xl bg-primary text-white font-bold text-sm shadow-lg shadow-primary/30 transition-all hover:scale-[1.02] flex items-center justify-center gap-2"
                            >
                                {isActionLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                                {editingPage?.id ? 'Update Strategy' : 'Add to Cluster'}
                            </button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    )
}
