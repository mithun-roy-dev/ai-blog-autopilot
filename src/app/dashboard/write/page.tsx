"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Globe, FileText, CheckCircle2, Clock, AlertCircle, Trash2, Save, ChevronLeft, LayoutGrid, Search, Edit3, Loader2, Zap, X, Star, Square, Play, Settings, Info } from "lucide-react"
import { createClient } from "@/utils/supabase/client"
import { cn } from "@/utils/cn"
import { toast } from "sonner"
import { logUI } from "@/utils/logger"

function WriteContent() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const supabase = createClient()
    const blogId = searchParams.get('blog_id')

    const [sites, setSites] = useState<any[]>([])
    const [jobs, setJobs] = useState<any[]>([])
    const [selectedJobIds, setSelectedJobIds] = useState<Set<string>>(new Set())
    const [isLoading, setIsLoading] = useState(true)
    const [isJobsLoading, setIsJobsLoading] = useState(false)
    const [editingJobId, setEditingJobId] = useState<string | null>(null)
    const [jobForm, setJobForm] = useState({ title: "", slug: "", primary_keyword: "" })

    useEffect(() => {
        fetchSites()
    }, [])

    useEffect(() => {
        if (blogId) {
            fetchJobs(blogId)
        } else {
            setJobs([])
        }
    }, [blogId])

    const fetchSites = async () => {
        setIsLoading(true)
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { data, error } = await supabase
            .from("blogs")
            .select("*")
            .order("created_at", { ascending: false })

        if (!error) {
            setSites(data || [])
            logUI('INFO', 'UI:WriteMenu', 'Fetched sites successfully', { siteCount: data?.length })
        } else {
            logUI('ERROR', 'UI:WriteMenu', 'Failed to fetch sites', { error })
        }
        setIsLoading(false)
    }

    const fetchJobs = async (id: string) => {
        setIsJobsLoading(true)
        const { data, error } = await supabase
            .from("writing_jobs")
            .select("*, content_clusters(topic)")
            .eq('blog_id', id)
            .order('created_at', { ascending: false })

        if (!error) {
            setJobs(data || [])
            setSelectedJobIds(new Set())
        }
        setIsJobsLoading(false)
    }

    const handleEditJob = (job: any) => {
        setEditingJobId(job.id)
        setJobForm({
            title: job.title,
            slug: job.slug,
            primary_keyword: job.primary_keyword || ""
        })
    }

    const handleSaveJob = async (jobId: string) => {
        try {
            const { error } = await supabase
                .from('writing_jobs')
                .update(jobForm)
                .eq('id', jobId)

            if (error) throw error
            toast.success("Job updated")
            logUI('INFO', 'UI:WriteMenu', 'Job updated manually', { jobId, newTitle: jobForm.title })
            setEditingJobId(null)
            if (blogId) fetchJobs(blogId)
        } catch (error: any) {
            logUI('ERROR', 'UI:WriteMenu', 'Failed to update job', { error: error.message, jobId })
            toast.error(error.message)
        }
    }

    const handleDeleteJob = async (jobId: string) => {
        if (!confirm("Are you sure?")) return
        try {
            const { error } = await supabase.from('writing_jobs').delete().eq('id', jobId)
            if (error) throw error
            toast.success("Job removed")
            logUI('INFO', 'UI:WriteMenu', 'Job deleted manually', { jobId })
            if (blogId) fetchJobs(blogId)
        } catch (error: any) {
            logUI('ERROR', 'UI:WriteMenu', 'Failed to delete job', { error: error.message, jobId })
            toast.error(error.message)
        }
    }

    const handleToggleSelect = (jobId: string) => {
        const next = new Set(selectedJobIds)
        if (next.has(jobId)) {
            next.delete(jobId)
        } else {
            next.add(jobId)
        }
        setSelectedJobIds(next)
    }

    const handleSelectAll = () => {
        if (selectedJobIds.size === jobs.length) {
            setSelectedJobIds(new Set())
        } else {
            setSelectedJobIds(new Set(jobs.map(j => j.id)))
        }
    }

    const handleUpdateStatus = async (jobId: string, status: string) => {
        try {
            const { error: updateError } = await supabase
                .from('writing_jobs')
                .update({ status })
                .eq('id', jobId)

            if (updateError) throw updateError

            // If starting the job, add to job_queue
            if (status === 'processing') {
                logUI('INFO', 'UI:WriteMenu', 'Job status updated to processing (Started)', { jobId })
                const { error: queueError } = await supabase
                    .from('job_queue')
                    .insert({
                        type: 'article_generation',
                        payload: { jobId },
                        user_id: (await supabase.auth.getUser()).data.user?.id
                    })
                if (queueError) throw queueError
            } else if (status === 'awaiting_start') {
                logUI('INFO', 'UI:WriteMenu', 'Job status updated to awaiting_start (Stopped)', { jobId })
            }

            if (blogId) fetchJobs(blogId)
        } catch (error: any) {
            logUI('ERROR', 'UI:WriteMenu', 'Failed to update job status', { error: error.message, jobId, status })
            toast.error(error.message)
        }
    }

    const handleUpdateWritingMode = async (id: string, mode: 'Auto' | 'Manual') => {
        try {
            const { error } = await supabase
                .from('blogs')
                .update({ writing_mode: mode })
                .eq('id', id)

            if (error) throw error
            toast.success(`Writing mode set to ${mode}`)
            logUI('INFO', 'UI:WriteMenu', 'Writing mode updated', { siteId: id, mode })
            fetchSites()
        } catch (error: any) {
            logUI('ERROR', 'UI:WriteMenu', 'Failed to update writing mode', { error: error.message, siteId: id })
            toast.error(error.message)
        }
    }

    const handleStartSelected = async () => {
        try {
            const idsToStart = Array.from(selectedJobIds).filter(id => {
                const job = jobs.find(j => j.id === id)
                return job?.status === 'awaiting_start'
            })

            if (idsToStart.length === 0) {
                toast.error("No jobs to start")
                return
            }

            // 1. Update writing_jobs status
            const { error: updateError } = await supabase
                .from('writing_jobs')
                .update({ status: 'processing' })
                .in('id', idsToStart)

            if (updateError) throw updateError

            // 2. Queue jobs in job_queue
            const { data: userData } = await supabase.auth.getUser()
            const queueItems = idsToStart.map(id => ({
                type: 'article_generation',
                payload: { jobId: id },
                user_id: userData.user?.id
            }))

            const { error: queueError } = await supabase
                .from('job_queue')
                .insert(queueItems)

            if (queueError) throw queueError

            toast.success(`${idsToStart.length} jobs started`)
            logUI('INFO', 'UI:WriteMenu', 'Multiple jobs started securely', { count: idsToStart.length, jobIds: idsToStart })
            setSelectedJobIds(new Set())
            if (blogId) fetchJobs(blogId)
        } catch (error: any) {
            logUI('ERROR', 'UI:WriteMenu', 'Failed to bulk start selected jobs', { error: error.message })
            toast.error(error.message)
        }
    }

    if (isLoading) {
        return (
            <div className="flex h-[80vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    // Site Selection View
    if (!blogId) {
        return (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Writing Dashboard</h1>
                    <p className="text-muted-foreground mt-1 text-lg">Select a site to manage writing jobs and progress.</p>
                </div>

                <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                    {sites.map((site) => (
                        <div
                            key={site.id}
                            onClick={() => router.push(`/dashboard/write?blog_id=${site.id}`)}
                            className="group relative cursor-pointer overflow-hidden rounded-3xl border bg-card p-8 transition-all hover:shadow-2xl hover:shadow-primary/5 hover:-translate-y-1 hover:border-primary/30"
                        >
                            <div className="flex items-center gap-4 mb-6">
                                <div className={cn(
                                    "rounded-2xl p-4 shadow-sm",
                                    site.site_type === 'wordpress' ? "bg-primary/10 text-primary border border-primary/20" : "bg-muted text-muted-foreground"
                                )}>
                                    <Globe className="h-7 w-7" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold group-hover:text-primary transition-colors">{site.name}</h3>
                                    <p className="text-xs text-muted-foreground truncate max-w-[150px]">{site.url}</p>
                                </div>
                            </div>

                            <div className="flex items-center justify-between text-sm font-medium border-t pt-4">
                                <span className="text-muted-foreground">Status</span>
                                <span className="text-emerald-500 font-bold bg-emerald-500/10 px-3 py-1 rounded-full text-[10px] uppercase">Online</span>
                            </div>

                            <div className="mt-6 pt-6 border-t border-dashed border-border/50">
                                <div className="flex items-center justify-between mb-4">
                                    <div className="flex items-center gap-2">
                                        <Settings className="h-4 w-4 text-muted-foreground" />
                                        <span className="text-xs font-black uppercase tracking-widest text-muted-foreground">Write Setup</span>
                                    </div>
                                    <div className="group/info relative">
                                        <Info className="h-3.5 w-3.5 text-muted-foreground/50 cursor-help" />
                                        <div className="absolute bottom-full right-0 mb-2 w-48 p-3 bg-card border rounded-2xl shadow-xl opacity-0 invisible group-hover/info:opacity-100 group-hover/info:visible transition-all z-50 text-[10px] font-medium leading-relaxed">
                                            {site.writing_mode === 'Manual' 
                                                ? "Pause after each step for your review and approval before proceeding."
                                                : "AI completes all steps automatically from research to final draft."}
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-2 p-1 bg-accent/30 rounded-2xl border border-border/50">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleUpdateWritingMode(site.id, 'Auto');
                                        }}
                                        className={cn(
                                            "py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                                            site.writing_mode === 'Auto' || !site.writing_mode
                                                ? "bg-primary text-white shadow-lg shadow-primary/20"
                                                : "text-muted-foreground hover:bg-accent/50"
                                        )}
                                    >
                                        Auto
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleUpdateWritingMode(site.id, 'Manual');
                                        }}
                                        className={cn(
                                            "py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all",
                                            site.writing_mode === 'Manual'
                                                ? "bg-primary text-white shadow-lg shadow-primary/20"
                                                : "text-muted-foreground hover:bg-accent/50"
                                        )}
                                    >
                                        Manual
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}

                    {sites.length === 0 && (
                        <div className="col-span-full py-20 flex flex-col items-center justify-center border-2 border-dashed rounded-3xl opacity-50">
                            <FileText className="h-12 w-12 mb-4" />
                            <p className="font-medium text-lg">No sites found</p>
                        </div>
                    )}
                </div>
            </div>
        )
    }

    // Site Writing Jobs View
    const currentSite = sites.find(s => s.id === blogId)

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => router.push('/dashboard/write')}
                        className="p-3 rounded-2xl bg-card border hover:bg-accent transition-all shadow-sm"
                    >
                        <ChevronLeft className="h-5 w-5" />
                    </button>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-3xl font-black tracking-tight">{currentSite?.name}</h1>
                            <span className="px-3 py-1 rounded-full bg-primary/10 text-primary text-[10px] font-black uppercase tracking-widest border border-primary/20">Writing Desk</span>
                        </div>
                        <p className="text-muted-foreground font-medium">{currentSite?.url}</p>
                    </div>
                </div>

                {selectedJobIds.size > 0 && (
                    <button
                        onClick={handleStartSelected}
                        className="flex items-center gap-3 px-8 py-3 bg-primary text-white font-black rounded-2xl shadow-lg shadow-primary/30 hover:scale-[1.05] active:scale-95 transition-all"
                    >
                        <Zap className="h-4 w-4" />
                        Start {selectedJobIds.size} Selected
                    </button>
                )}
            </div>

            <div className="bg-card/40 rounded-[2.5rem] border border-border/50 backdrop-blur-sm overflow-hidden shadow-xl">
                <div className="p-8 border-b border-border/50 flex items-center justify-between bg-card/60">
                    <div className="flex items-center gap-6">
                        <input
                            type="checkbox"
                            checked={jobs.length > 0 && selectedJobIds.size === jobs.length}
                            onChange={handleSelectAll}
                            className="h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                        />
                        <h3 className="text-xl font-black flex items-center gap-3">
                            <FileText className="h-6 w-6 text-primary" />
                            Writing Job Queue
                        </h3>
                    </div>
                    <div className="px-4 py-2 bg-accent/50 rounded-2xl text-xs font-bold text-muted-foreground">
                        {jobs.length} Active Jobs
                    </div>
                </div>

                <div className="divide-y divide-border/40">
                    {jobs.map((job) => (
                        <div key={job.id} className="p-8 group hover:bg-primary/[0.02] transition-colors relative">
                            {editingJobId === job.id ? (
                                <div className="space-y-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground pl-1">Article Title</label>
                                            <input
                                                value={jobForm.title}
                                                onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })}
                                                className="w-full bg-background border rounded-2xl px-5 py-3 outline-none focus:ring-2 focus:ring-primary/20 font-bold"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground pl-1">Slug</label>
                                            <input
                                                value={jobForm.slug}
                                                onChange={(e) => setJobForm({ ...jobForm, slug: e.target.value })}
                                                className="w-full bg-background border rounded-2xl px-5 py-3 outline-none focus:ring-2 focus:ring-primary/20 font-mono text-sm"
                                            />
                                        </div>
                                        <div className="md:col-span-2 space-y-2">
                                            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground pl-1">Primary Keyword</label>
                                            <input
                                                value={jobForm.primary_keyword}
                                                onChange={(e) => setJobForm({ ...jobForm, primary_keyword: e.target.value })}
                                                className="w-full bg-background border rounded-2xl px-5 py-3 outline-none focus:ring-2 focus:ring-primary/20 font-bold text-primary"
                                                placeholder="Enter primary keyword..."
                                            />
                                        </div>
                                    </div>
                                    <div className="flex gap-3 justify-end pt-4">
                                        <button onClick={() => setEditingJobId(null)} className="px-6 py-2.5 rounded-xl bg-accent font-bold text-sm">Cancel</button>
                                        <button onClick={() => handleSaveJob(job.id)} className="px-8 py-2.5 rounded-xl bg-primary text-white font-bold text-sm shadow-lg shadow-primary/20 flex items-center gap-2">
                                            <Save className="h-4 w-4" /> Save Details
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8 cursor-pointer hover:bg-black/[0.01] p-2 rounded-xl" onClick={() => router.push(`/dashboard/write/${job.id}`)}>
                                    <div className="flex items-center gap-6 flex-1">
                                        <input
                                            type="checkbox"
                                            checked={selectedJobIds.has(job.id)}
                                            onChange={(e) => {
                                                e.stopPropagation();
                                                handleToggleSelect(job.id);
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                            className="h-5 w-5 rounded border-gray-300 text-primary focus:ring-primary cursor-pointer"
                                        />
                                        <div className="space-y-4 flex-1">
                                            <div className="flex items-center gap-3">
                                                <div className={cn(
                                                    "px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 border shadow-sm",
                                                    job.status === 'completed' ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" :
                                                        job.status === 'processing' ? "bg-amber-500/10 text-amber-600 border-amber-500/20 animate-pulse" :
                                                            job.status === 'awaiting_start' ? "bg-blue-500/10 text-blue-600 border-blue-500/20" :
                                                                "bg-red-500/10 text-red-600 border-red-500/20"
                                                )}>
                                                    {job.status === 'processing' && <Clock className="h-3 w-3 animate-spin" />}
                                                    {job.status === 'completed' && <CheckCircle2 className="h-3 w-3" />}
                                                    {job.status === 'awaiting_start' && <Zap className="h-3 w-3 text-blue-500" />}
                                                    {job.status === 'failed' && <AlertCircle className="h-3 w-3" />}
                                                    {job.status === 'awaiting_start' ? 'Awaiting Start' : job.status.charAt(0).toUpperCase() + job.status.slice(1)}
                                                </div>
                                                {job.content_clusters?.topic && (
                                                    <span className="px-3 py-1.5 rounded-xl bg-indigo-500/10 text-indigo-600 text-[10px] font-black uppercase tracking-widest border border-indigo-500/20">
                                                        Cluster: {job.content_clusters.topic}
                                                    </span>
                                                )}
                                            </div>

                                            <div>
                                                <h4 className="text-2xl font-black text-foreground group-hover:text-primary transition-colors">{job.title}</h4>
                                                <div className="flex items-center gap-4 mt-2 font-medium text-xs text-muted-foreground">
                                                    <span className="flex items-center gap-1.5 bg-accent/50 px-3 py-1 rounded-lg">
                                                        <LayoutGrid className="h-3.5 w-3.5" />
                                                        Slug: {job.slug}
                                                    </span>
                                                    <span className="flex items-center gap-1.5 bg-primary/5 px-3 py-1 rounded-lg text-primary/80">
                                                        <Edit3 className="h-3.5 w-3.5" />
                                                        Keyword: <span className="font-bold underline decoration-primary/30 underline-offset-4">{job.primary_keyword || 'Not set'}</span>
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 shrink-0" onClick={(e) => e.stopPropagation()}>
                                        {job.status === 'awaiting_start' && (
                                            <button
                                                onClick={() => handleUpdateStatus(job.id, 'processing')}
                                                className="h-12 w-12 rounded-2xl bg-indigo-500 text-white flex items-center justify-center hover:bg-indigo-600 hover:scale-[1.05] transition-all shadow-md active:scale-95"
                                                title="Start Job"
                                            >
                                                <Star className="h-5 w-5 fill-white" />
                                            </button>
                                        )}
                                        {job.status === 'processing' && (
                                            <button
                                                onClick={() => handleUpdateStatus(job.id, 'awaiting_start')}
                                                className="h-12 w-12 rounded-2xl bg-red-500 text-white flex items-center justify-center hover:bg-red-600 hover:scale-[1.05] transition-all shadow-md active:scale-95"
                                                title="Stop Job"
                                            >
                                                <Square className="h-5 w-5 fill-white" />
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleEditJob(job)}
                                            className="h-12 w-12 rounded-2xl bg-card border border-border/50 flex items-center justify-center hover:bg-accent hover:border-border transition-all shadow-sm"
                                        >
                                            <Edit3 className="h-5 w-5 text-muted-foreground" />
                                        </button>
                                        <button
                                            onClick={() => handleDeleteJob(job.id)}
                                            className="h-12 w-12 rounded-2xl bg-red-500/[0.03] border border-red-500/10 flex items-center justify-center hover:bg-red-500 hover:text-white transition-all group/del shadow-sm"
                                        >
                                            <Trash2 className="h-5 w-5 text-red-500/40 group-hover/del:text-white" />
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}

                    {jobs.length === 0 && !isJobsLoading && (
                        <div className="py-20 flex flex-col items-center justify-center text-center px-6">
                            <div className="h-20 w-20 rounded-[2rem] bg-accent/50 flex items-center justify-center mb-6">
                                <FileText className="h-10 w-10 text-muted-foreground/30" />
                            </div>
                            <h4 className="text-2xl font-black mb-2 uppercase tracking-tight">Writing Queue Empty</h4>
                            <p className="text-muted-foreground font-medium max-w-sm">No writing jobs initiated yet. Navigate to the Clusters page to start new AI writing tasks.</p>
                            <button
                                onClick={() => router.push('/dashboard/clusters')}
                                className="mt-8 px-8 py-3 bg-primary text-white font-black rounded-2xl shadow-lg shadow-primary/30 hover:scale-[1.05] transition-all"
                            >
                                Go to Clusters
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}

export default function WritePage() {
    return (
        <Suspense fallback={
            <div className="flex h-[80vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        }>
            <WriteContent />
        </Suspense>
    )
}
