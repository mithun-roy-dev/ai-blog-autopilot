"use client"

import { useState, useEffect, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Globe, FileText, CheckCircle2, Clock, AlertCircle, Trash2, Save, ChevronLeft, LayoutGrid, Search, Edit3, Loader2 } from "lucide-react"
import { createClient } from "@/utils/supabase/client"
import { cn } from "@/utils/cn"
import { toast } from "sonner"

function WriteContent() {
    const searchParams = useSearchParams()
    const router = useRouter()
    const supabase = createClient()
    const blogId = searchParams.get('blog_id')

    const [sites, setSites] = useState<any[]>([])
    const [jobs, setJobs] = useState<any[]>([])
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

        if (!error) setSites(data || [])
        setIsLoading(false)
    }

    const fetchJobs = async (id: string) => {
        setIsJobsLoading(true)
        const { data, error } = await supabase
            .from("writing_jobs")
            .select("*, content_clusters(topic)")
            .eq('blog_id', id)
            .order('created_at', { ascending: false })

        if (!error) setJobs(data || [])
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
            setEditingJobId(null)
            if (blogId) fetchJobs(blogId)
        } catch (error: any) {
            toast.error(error.message)
        }
    }

    const handleDeleteJob = async (jobId: string) => {
        if (!confirm("Are you sure?")) return
        try {
            const { error } = await supabase.from('writing_jobs').delete().eq('id', jobId)
            if (error) throw error
            toast.success("Job removed")
            if (blogId) fetchJobs(blogId)
        } catch (error: any) {
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
            </div>

            <div className="bg-card/40 rounded-[2.5rem] border border-border/50 backdrop-blur-sm overflow-hidden shadow-xl">
                <div className="p-8 border-b border-border/50 flex items-center justify-between bg-card/60">
                    <h3 className="text-xl font-black flex items-center gap-3">
                        <FileText className="h-6 w-6 text-primary" />
                        Writing Job Queue
                    </h3>
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
                                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
                                    <div className="space-y-4 flex-1">
                                        <div className="flex items-center gap-3">
                                            <div className={cn(
                                                "px-4 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 border shadow-sm",
                                                job.status === 'completed' ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" :
                                                    job.status === 'processing' ? "bg-amber-500/10 text-amber-600 border-amber-500/20 animate-pulse" :
                                                        "bg-red-500/10 text-red-600 border-red-500/20"
                                            )}>
                                                {job.status === 'processing' && <Clock className="h-3 w-3 animate-spin" />}
                                                {job.status === 'completed' && <CheckCircle2 className="h-3 w-3" />}
                                                {job.status === 'failed' && <AlertCircle className="h-3 w-3" />}
                                                {job.status}
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

                                    <div className="flex items-center gap-3 shrink-0">
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
