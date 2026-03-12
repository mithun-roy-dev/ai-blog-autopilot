"use client"

import { useState, useEffect, useRef } from "react"
import { useParams, useRouter } from "next/navigation"
import {
    ChevronLeft,
    Search,
    PieChart,
    FileText,
    PenTool,
    Edit,
    UserCheck,
    Clock,
    CheckCircle2,
    AlertCircle,
    Loader2,
    Globe,
    Zap,
    ExternalLink,
    Square,
    Star,
    ChevronDown,
    ArrowRight
} from "lucide-react"
import { createClient } from "@/utils/supabase/client"
import { cn } from "@/utils/cn"
import { toast } from "sonner"
import { logUI } from "@/utils/logger"

const STEPS = [
    { id: 'serp_calling', name: 'SERP API Calling', icon: Search, description: 'Fetching Google search results' },
    { id: 'serp_analyzing', name: 'SERP Analyzer', icon: PieChart, description: 'Analyzing competitor content' },
    { id: 'briefing', name: 'Content Brief', icon: FileText, description: 'Generating article structure' },
    { id: 'writing', name: 'Writer Agent', icon: PenTool, description: 'AI Writing in progress' },
    { id: 'editing', name: 'Editor Agent', icon: Edit, description: 'Reviewing and refining' },
    { id: 'humanizing', name: 'Humanizer Agent', icon: UserCheck, description: 'Final persona polish' },
]

export default function JobDetailPage() {
    const params = useParams()
    const id = params?.id as string
    const router = useRouter()
    const supabase = createClient()
    const [job, setJob] = useState<any>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [selectedViewStep, setSelectedViewStep] = useState<string | null>(null)
    const [expandedHeadings, setExpandedHeadings] = useState<{ [pageIndex: number]: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | null }>({})
    const detailsRef = useRef<HTMLDivElement>(null)

    const prevGenerationStatus = useRef<string | null>(null)

    useEffect(() => {
        if (!id) return
        fetchJob()

        // Subscribe to real-time updates
        const channel = supabase
            .channel(`job-${id}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'writing_jobs',
                    filter: `id=eq.${id}`
                },
                () => {
                    // Always re-fetch the full row — real-time payload.new can be
                    // truncated when generation_data is large
                    fetchJob()
                }
            )
            .subscribe()

        return () => {
            supabase.removeChannel(channel)
        }
    }, [id])

    const fetchJob = async () => {
        try {
            const { data, error } = await supabase
                .from('writing_jobs')
                .select('*, blogs(name, url)')
                .eq('id', id)
                .single()

            if (error) throw error
            setJob(data)

            // Auto-select the current active step if none is selected
            if (!selectedViewStep && data?.generation_status) {
                setSelectedViewStep(data.generation_status)
            }
            logUI('INFO', 'UI:JobDetails', 'Fetched job details successfully', { jobId: id, status: data?.status })
        } catch (err: any) {
            logUI('ERROR', 'UI:JobDetails', 'Failed to fetch job details', { error: err.message, jobId: id })
            toast.error(err.message)
            router.push('/dashboard/write')
        } finally {
            setIsLoading(false)
        }
    }

    // Polling fallback: re-fetch every 3s while the job is actively running.
    // This guarantees UI stays fresh even when real-time events are missed.
    useEffect(() => {
        const isActive = job?.status === 'processing' || job?.status === 'awaiting_approval'
        if (!id || !isActive) return
        const interval = setInterval(() => fetchJob(), 3000)
        return () => clearInterval(interval)
    }, [id, job?.status])

    // Auto-advance the viewed step ONLY when generation_status changes to a new value.
    // Crucially: only advance FORWARD in the pipeline. If the DB returns a stale/older
    // generation_status (e.g. after an optimistic update), ignore it to prevent regression.
    useEffect(() => {
        const newStatus = job?.generation_status
        if (!newStatus) return
        const newIdx = STEPS.findIndex(s => s.id === newStatus)
        if (newIdx < 0) return
        if (newStatus === prevGenerationStatus.current) return  // same step, skip
        const currentIdx = STEPS.findIndex(s => s.id === prevGenerationStatus.current)
        if (currentIdx >= 0 && newIdx < currentIdx) return  // DB returned older step — ignore regression
        prevGenerationStatus.current = newStatus
        setSelectedViewStep(newStatus)
    }, [job?.generation_status])

    // Maps each step to the next step in the pipeline
    const NEXT_STEP: Record<string, string> = {
        serp_calling: 'serp_analyzing',
        serp_analyzing: 'briefing',
        briefing: 'writing',
        writing: 'editing',
        editing: 'humanizing',
    }

    const handleProceed = async () => {
        try {
            const userId = (await supabase.auth.getUser()).data.user?.id

            // Optimistic update: immediately advance the UI to the next step
            // so the card animation jumps forward INSTANTLY on click,
            // without waiting 2-3s for the worker to poll and advance generation_status
            const nextStep = job?.generation_status ? NEXT_STEP[job.generation_status] : null
            if (nextStep) {
                prevGenerationStatus.current = nextStep  // prevent auto-advance double-fire
                setSelectedViewStep(nextStep)
                setJob(prev => prev ? { ...prev, status: 'processing', generation_status: nextStep } : prev)
            }

            // 1. Set writing_job status back to processing
            const { error: updateError } = await supabase
                .from('writing_jobs')
                .update({ status: 'processing' })
                .eq('id', id)
            if (updateError) throw updateError

            // 2. Re-queue the job so the worker picks up from the next uncompleted step
            const { error: queueError } = await supabase
                .from('job_queue')
                .insert({
                    type: 'article_generation',
                    payload: { jobId: id },
                    user_id: userId
                })
            if (queueError) throw queueError

            logUI('INFO', 'UI:JobDetails', 'Job re-queued to proceed to next step', { jobId: id })
            toast.success("Proceeding to next step...")
            // Note: no fetchJob() here intentionally — calling it immediately would return
            // stale DB data (generation_status still = old step) and overwrite the optimistic
            // update, causing the animation to snap back. The 3s polling handles data refresh.
        } catch (error: any) {
            logUI('ERROR', 'UI:JobDetails', 'Failed to proceed to next step', { error: error.message, jobId: id })
            toast.error(error.message)
        }
    }

    const handleUpdateStatus = async (status: string) => {
        try {
            const { error: updateError } = await supabase
                .from('writing_jobs')
                .update({ status })
                .eq('id', id)

            if (updateError) throw updateError

            // If starting the job, add to job_queue
            if (status === 'processing') {
                const { error: queueError } = await supabase
                    .from('job_queue')
                    .insert({
                        type: 'article_generation',
                        payload: { jobId: id },
                        user_id: (await supabase.auth.getUser()).data.user?.id
                    })
                if (queueError) throw queueError
                logUI('INFO', 'UI:JobDetails', 'Job status updated to processing (Started)', { jobId: id })
                toast.success("Generation started!")
            } else {
                logUI('INFO', 'UI:JobDetails', `Job status updated to ${status}`, { jobId: id, status })
                toast.success(`Job status updated to ${status}`)
            }

            fetchJob()
        } catch (error: any) {
            logUI('ERROR', 'UI:JobDetails', 'Failed to update job status', { error: error.message, jobId: id, status })
            toast.error(error.message)
        }
    }

    const handleStepClick = (stepId: string) => {
        setSelectedViewStep(stepId)
        logUI('DEBUG', 'UI:JobDetails', 'User changed step view', { jobId: id, stepId })
        setTimeout(() => {
            detailsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }, 100)
    }

    const toggleHeadingExpansion = (pageIndex: number, type: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6') => {
        setExpandedHeadings(prev => ({
            ...prev,
            [pageIndex]: prev[pageIndex] === type ? null : type
        }))
    }

    if (isLoading) {
        return (
            <div className="flex h-[80vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    const currentStepIndex = STEPS.findIndex(s => s.id === job?.generation_status)
    const isFailed = job?.status === 'failed'
    const isCompleted = job?.status === 'completed'

    return (
        <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700 pb-20 p-6">
            {/* Top Section: Title (4/5) and Details (1/5) */}
            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

                {/* Left Side: Header & Title (lg:col-span-4) */}
                <div className="lg:col-span-4 flex flex-col justify-center bg-card/40 rounded-[2rem] border border-border/50 p-8 shadow-sm">
                    <div className="flex items-start gap-4">
                        <button
                            onClick={() => router.push(job?.blog_id ? `/dashboard/write?blog_id=${job.blog_id}` : '/dashboard/write')}
                            className="p-3 rounded-2xl bg-card border hover:bg-accent transition-all shadow-sm shrink-0"
                        >
                            <ChevronLeft className="h-5 w-5" />
                        </button>
                        <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-3 mb-2">
                                <h1 className="text-[2rem] leading-tight text-wrap font-black tracking-tight">{job?.title}</h1>
                                <span className={cn(
                                    "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border shrink-0",
                                    isFailed ? "bg-red-500/10 text-red-600 border-red-500/20" :
                                        isCompleted ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20" :
                                            job?.status === 'awaiting_approval' ? "bg-amber-500/10 text-amber-600 border-amber-500/20" :
                                                "bg-primary/10 text-primary border-primary/20"
                                )}>
                                    {job?.status === 'awaiting_approval' ? 'PAUSED' : job?.status.replace('_', ' ').toUpperCase()}
                                </span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground font-medium">
                                <p className="flex items-center gap-2">
                                    <Globe className="h-4 w-4 text-orange-500" />
                                    Target site: <span className="text-foreground font-bold">{job?.blogs?.name}</span>
                                    <span className="text-xs opacity-50 ml-1">({job?.slug})</span>
                                </p>
                                <p className="flex items-center gap-2">
                                    <Search className="h-4 w-4 text-primary" />
                                    Keyword: <span className="text-primary font-bold">{job?.primary_keyword}</span>
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right Side: Job Details & Controls (lg:col-span-1) */}
                <div className="lg:col-span-1 bg-card/80 rounded-[2rem] border border-border/50 p-6 shadow-xl backdrop-blur-md flex flex-col justify-between gap-6">
                    <div className="flex flex-col items-center justify-center flex-1 gap-2 text-center">
                        <h3 className="text-[10px] font-black uppercase tracking-widest text-primary mb-1">Job Details</h3>
                        <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                            <Clock className="h-4 w-4 text-primary" />
                        </div>
                        <div className="min-w-0 flex flex-col items-center justify-center">
                            <p className="text-[8px] font-black text-muted-foreground uppercase tracking-widest">Started At</p>
                            <p className="text-xs font-bold truncate">{new Date(job?.created_at).toLocaleString()}</p>
                        </div>
                    </div>

                    <div className="pt-4 border-t border-border/50">
                        {job?.status === 'awaiting_start' && (
                            <button
                                onClick={() => handleUpdateStatus('processing')}
                                className="w-full flex justify-center items-center gap-2 px-4 py-3 bg-primary text-white font-black rounded-xl shadow-lg shadow-primary/20 hover:scale-[1.02] active:scale-95 transition-all uppercase tracking-tighter text-xs"
                            >
                                <Star className="h-4 w-4 fill-white" /> Start Job
                            </button>
                        )}
                        {job?.status === 'processing' && (
                            <button
                                onClick={() => handleUpdateStatus('failed')}
                                className="w-full flex justify-center items-center gap-2 px-4 py-3 bg-red-500 text-white font-black rounded-xl shadow-lg shadow-red-500/20 hover:scale-[1.02] active:scale-95 transition-all uppercase tracking-tighter text-xs"
                            >
                                <Square className="h-4 w-4 fill-white" /> Stop Job
                            </button>
                        )}
                        {job?.status === 'awaiting_approval' && (
                            <button
                                onClick={handleProceed}
                                className="w-full flex justify-center items-center gap-2 px-4 py-3 bg-amber-500 text-white font-black rounded-xl shadow-lg shadow-amber-500/20 hover:scale-[1.02] active:scale-95 transition-all uppercase tracking-tighter text-xs"
                            >
                                <ArrowRight className="h-4 w-4" />
                                {job?.generation_status === 'serp_calling' ? 'Proceed to SERP Analysis' :
                                 job?.generation_status === 'serp_analyzing' ? 'Proceed to Content Brief' :
                                 job?.generation_status === 'briefing' ? 'Proceed to Writing' :
                                 job?.generation_status === 'writing' ? 'Proceed to Editing' :
                                 job?.generation_status === 'editing' ? 'Proceed to Humanizing' :
                                 'Proceed to Next Step'}
                            </button>
                        )}
                        {isFailed && (
                            <button
                                onClick={() => handleUpdateStatus('awaiting_start')}
                                className="w-full flex justify-center items-center gap-2 px-4 py-3 bg-card border border-border hover:bg-accent text-foreground font-black rounded-xl transition-all uppercase tracking-tighter text-xs"
                            >
                                <Zap className="h-4 w-4" /> Retry Job
                            </button>
                        )}
                        {isCompleted && (
                            <button className="w-full flex justify-center items-center gap-2 px-4 py-3 bg-emerald-500/10 text-emerald-600 font-black rounded-xl cursor-default uppercase tracking-tighter text-xs border border-emerald-500/20">
                                <CheckCircle2 className="h-4 w-4" /> Completed
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Progress Stepper */}
            <div ref={detailsRef} className="grid grid-cols-1 md:grid-cols-6 gap-4 scroll-mt-12">
                {STEPS.map((step, index) => {
                    const stepProgress = job?.generation_progress?.[step.id]
                    const isDone = stepProgress?.status === 'completed' || isCompleted
                    const isPaused = job?.status === 'awaiting_approval' && job?.generation_status === step.id
                    const isCurrent = (job?.generation_status === step.id && job?.status === 'processing') || isPaused
                    const isPending = !isDone && !isCurrent
                    const isSelected = selectedViewStep === step.id
                    const canView = isDone || isCurrent

                    return (
                        <button
                            key={step.id}
                            onClick={() => canView && handleStepClick(step.id)}
                            disabled={!canView}
                            className={cn(
                                "relative p-5 rounded-3xl border transition-all duration-500 overflow-hidden group text-left",
                                canView ? "cursor-pointer hover:border-primary/40" : "cursor-not-allowed opacity-60",
                                isSelected ? "ring-2 ring-primary ring-offset-2 ring-offset-background shadow-lg shadow-primary/10" : "",
                                isDone ? "bg-emerald-500/5 border-emerald-500/20" :
                                    isPaused ? "bg-amber-500/5 border-amber-500/20 shadow-lg shadow-amber-500/5" :
                                        isCurrent ? "bg-primary/5 border-primary/30 shadow-lg shadow-primary/5 scale-[1.02]" :
                                            "bg-card/50 border-border/50"
                            )}
                        >
                            <div className="flex flex-col items-center text-center space-y-3 relative z-10">
                                <div className={cn(
                                    "h-12 w-12 rounded-2xl flex items-center justify-center transition-all duration-500",
                                    isDone ? "bg-emerald-500 text-white" :
                                        isPaused ? "bg-amber-500 text-white" :
                                            isCurrent ? "bg-primary text-white shadow-[0_0_15px_rgba(var(--primary),0.5)]" :
                                                "bg-accent text-muted-foreground"
                                )}>
                                    {isDone ? <CheckCircle2 className="h-6 w-6" /> : 
                                     isPaused ? <Clock className="h-6 w-6" /> :
                                     <step.icon className={cn("h-6 w-6", isCurrent ? "animate-pulse" : "")} />}
                                </div>
                                <div>
                                    <h3 className="font-black text-sm uppercase tracking-tight">{step.name}</h3>
                                    <p className="text-[10px] font-medium text-muted-foreground mt-1">{step.description}</p>
                                </div>
                            </div>

                            {/* Processing Animation Line */}
                            {isCurrent && !isPaused && (
                                <div className="absolute bottom-0 left-0 h-1 bg-primary animate-shimmer" style={{ width: '100%' }} />
                            )}
                        </button>
                    )
                })}
            </div>

            {/* Error Message */}
            {isFailed && (
                <div className="p-6 rounded-3xl bg-red-500/5 border border-red-500/20 flex items-center gap-4 text-red-600">
                    <AlertCircle className="h-6 w-6 shrink-0" />
                    <div>
                        <h4 className="font-black uppercase tracking-tight text-sm">Generation Failed</h4>
                        <p className="text-sm font-medium opacity-80">{job?.error_message || "An unknown error occurred during the generation process."}</p>
                    </div>
                </div>
            )}

            {/* Main Content Area - Full Width */}
            <div className="space-y-8 pt-4">
                {/* SERP Results Preview (Step 1) */}
                {selectedViewStep === 'serp_calling' && job?.generation_data?.serp && (
                    <div className="bg-card rounded-[2.5rem] border border-border/50 overflow-hidden shadow-xl animate-in zoom-in-95 duration-500">
                        <div className="p-8 border-b border-border/50 flex items-center justify-between bg-card/60">
                            <div className="flex items-center gap-4">
                                <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20">
                                    <Globe className="h-6 w-6 text-primary" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black italic uppercase tracking-tight">Step 1: SERP Insights</h3>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="px-2 py-0.5 rounded-lg bg-indigo-500/10 text-indigo-600 text-[10px] font-black uppercase tracking-widest border border-indigo-500/20">
                                            Intent: {job.generation_data.serp.intent || 'Analyzing...'}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="p-8 space-y-6">
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                                <div className="p-6 rounded-3xl bg-accent/30 border border-border/40">
                                    <h4 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-4">Organic Results ({job.generation_data.serp.organic_results?.length || 0})</h4>
                                    <div className="space-y-3">
                                        {job.generation_data.serp.organic_results?.slice(0, 10).map((res: any, i: number) => (
                                            <div key={i} className="flex items-start gap-3 p-3 rounded-2xl bg-background/50 border border-border/20 group hover:border-primary/30 transition-all">
                                                <span className="h-6 w-6 rounded-full bg-primary/10 text-primary text-[10px] flex items-center justify-center font-black shrink-0">{i + 1}</span>
                                                <div className="flex-1 min-w-0">
                                                    <h5 className="text-sm font-bold truncate group-hover:text-primary transition-colors">{res.title}</h5>
                                                    <p className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5 font-mono text-xs">{res.link}</p>
                                                </div>
                                                <a href={res.link} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-all">
                                                    <ExternalLink className="h-3.5 w-3.5" />
                                                </a>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-6">
                                    <div className="p-6 rounded-3xl bg-accent/30 border border-border/40">
                                        <h4 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-4">People Also Ask</h4>
                                        <div className="space-y-3">
                                            {job.generation_data.serp.related_questions?.slice(0, 8).map((q: any, i: number) => (
                                                <div key={i} className="text-[11px] font-bold p-4 rounded-2xl bg-background/40 border border-border/20 italic text-foreground">
                                                    "{q.question}"
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="p-6 rounded-3xl bg-accent/30 border border-border/40">
                                        <h4 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-4">Related Searches</h4>
                                        <div className="flex flex-wrap gap-2 text-foreground">
                                            {job.generation_data.serp.related_searches?.slice(0, 10).map((s: any, i: number) => (
                                                <span key={i} className="px-4 py-2 rounded-2xl bg-background/60 border border-border/30 text-[10px] font-bold hover:border-primary/40 transition-all cursor-default shadow-sm text-foreground">
                                                    {s.query}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            {/* In-view Proceed Button */}
                            {job?.status === 'awaiting_approval' && job?.generation_status === 'serp_calling' && (
                                <div className="mt-8 pt-8 border-t border-border/50 flex justify-center">
                                    <button
                                        onClick={handleProceed}
                                        className="flex items-center gap-3 px-10 py-4 bg-amber-500 text-white font-black rounded-2xl shadow-xl shadow-amber-500/20 hover:scale-[1.05] active:scale-95 transition-all uppercase tracking-tighter"
                                    >
                                        <ArrowRight className="h-5 w-5" /> Proceed to SERP Analysis
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Placeholder for pending or currently generating step without data yet */}
                {selectedViewStep === 'serp_calling' && !(job?.generation_data?.serp) && !isFailed && (
                    <div className="h-64 rounded-[2.5rem] border-2 border-dashed border-border flex flex-col items-center justify-center text-muted-foreground space-y-4">
                        <Loader2 className="h-10 w-10 animate-spin text-primary" />
                        <p className="font-bold text-sm uppercase tracking-widest animate-pulse">Running SERP queries...</p>
                    </div>
                )}

                {/* SERP Analysis Preview (Step 2) */}
                {selectedViewStep === 'serp_analyzing' && job?.generation_data?.analysis && (
                    <div className="bg-card rounded-[2.5rem] border border-border/50 overflow-hidden shadow-xl animate-in zoom-in-95 duration-500">
                        <div className="p-8 border-b border-border/50 flex items-center justify-between bg-card/60">
                            <div className="flex items-center gap-4">
                                <div className="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20">
                                    <PieChart className="h-6 w-6 text-indigo-500" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black italic uppercase tracking-tight">Step 2: SERP Analyzer</h3>
                                    <div className="flex items-center gap-2 mt-1">
                                        <span className="px-2 py-0.5 rounded-lg bg-emerald-500/10 text-emerald-600 text-[10px] font-black uppercase tracking-widest border border-emerald-500/20">
                                            Avg Word Count: {job.generation_data.analysis.average_word_count?.toLocaleString() || 0}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div className="p-8 bg-card/30">
                            <h4 className="text-sm font-black uppercase tracking-widest text-muted-foreground mb-6">Analyzed Competitors ({job.generation_data.analysis.pages?.length || 0})</h4>
                            <div className="space-y-4">
                                {job.generation_data.analysis.pages?.map((page: any, i: number) => (
                                    <div key={i} className="p-5 rounded-[1.5rem] bg-background border border-border/60 hover:border-primary/40 hover:shadow-md transition-all flex flex-col gap-4">
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1 min-w-0 flex items-start gap-4">
                                                <span className={cn(
                                                    "h-8 w-8 rounded-xl flex items-center justify-center font-black shrink-0 text-xs shadow-sm bg-card border",
                                                    page.error ? "text-red-500 border-red-500/20" : "text-foreground"
                                                )}>{i + 1}</span>
                                                <div className="min-w-0 flex-1 pt-1">
                                                    <h5 className="font-bold text-foreground line-clamp-2 leading-snug text-sm select-all">
                                                        {page.meta_title || (page.error ? 'Failed to parse page content' : 'No Meta Title Found')}
                                                    </h5>
                                                    <p className="text-[10px] font-mono mt-1.5 text-muted-foreground truncate opacity-80">{page.link}</p>
                                                </div>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <span className={cn(
                                                    "px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest shadow-sm",
                                                    page.error ? "bg-red-500/5 text-red-500 border-red-500/20" : "bg-card text-foreground border-border/50"
                                                )}>
                                                    {page.word_count?.toLocaleString()} words
                                                </span>
                                            </div>
                                        </div>

                                        {/* Headings Preview & Expandable Toggles */}
                                        {!page.error && (
                                            <div className="pl-12 space-y-3 mt-1">
                                                <div className="flex flex-wrap gap-2">
                                                    {page.h1 && (
                                                        <button
                                                            onClick={() => toggleHeadingExpansion(i, 'h1')}
                                                            className={cn(
                                                                "flex items-center text-[11px] p-2 rounded-xl border transition-all hover:bg-accent/50",
                                                                expandedHeadings[i] === 'h1' ? "bg-accent/50 border-primary/30" : "bg-accent/20 border-border/30"
                                                            )}
                                                        >
                                                            <span className="font-black text-muted-foreground mr-1.5">H1</span>
                                                            <span className="font-medium text-foreground truncate max-w-[200px]">{page.h1}</span>
                                                            <ChevronDown className={cn("ml-1.5 h-3.5 w-3.5 text-muted-foreground transition-transform", expandedHeadings[i] === 'h1' && "rotate-180 text-primary")} />
                                                        </button>
                                                    )}
                                                    {page.h2?.length > 0 && (
                                                        <button
                                                            onClick={() => toggleHeadingExpansion(i, 'h2')}
                                                            className={cn(
                                                                "flex items-center text-[11px] p-2 rounded-xl border transition-all hover:bg-accent/50",
                                                                expandedHeadings[i] === 'h2' ? "bg-accent/50 border-primary/30" : "bg-accent/20 border-border/30"
                                                            )}
                                                        >
                                                            <span className="font-black text-muted-foreground mr-1.5">H2</span>
                                                            <span className="font-bold text-primary px-1.5 py-0.5 rounded-md bg-primary/10">{page.h2.length} items</span>
                                                            <ChevronDown className={cn("ml-1.5 h-3.5 w-3.5 text-muted-foreground transition-transform", expandedHeadings[i] === 'h2' && "rotate-180 text-primary")} />
                                                        </button>
                                                    )}
                                                    {page.h3?.length > 0 && (
                                                        <button
                                                            onClick={() => toggleHeadingExpansion(i, 'h3')}
                                                            className={cn(
                                                                "flex items-center text-[11px] p-2 rounded-xl border transition-all hover:bg-accent/50",
                                                                expandedHeadings[i] === 'h3' ? "bg-accent/50 border-primary/30" : "bg-accent/20 border-border/30"
                                                            )}
                                                        >
                                                            <span className="font-black text-muted-foreground mr-1.5">H3</span>
                                                            <span className="font-bold text-primary px-1.5 py-0.5 rounded-md bg-primary/10">{page.h3.length} items</span>
                                                            <ChevronDown className={cn("ml-1.5 h-3.5 w-3.5 text-muted-foreground transition-transform", expandedHeadings[i] === 'h3' && "rotate-180 text-primary")} />
                                                        </button>
                                                    )}
                                                    {page.h4?.length > 0 && (
                                                        <button
                                                            onClick={() => toggleHeadingExpansion(i, 'h4')}
                                                            className={cn(
                                                                "flex items-center text-[11px] p-2 rounded-xl border transition-all hover:bg-accent/50",
                                                                expandedHeadings[i] === 'h4' ? "bg-accent/50 border-primary/30" : "bg-accent/20 border-border/30"
                                                            )}
                                                        >
                                                            <span className="font-black text-muted-foreground mr-1.5">H4</span>
                                                            <span className="font-bold text-primary px-1.5 py-0.5 rounded-md bg-primary/10">{page.h4.length} items</span>
                                                            <ChevronDown className={cn("ml-1.5 h-3.5 w-3.5 text-muted-foreground transition-transform", expandedHeadings[i] === 'h4' && "rotate-180 text-primary")} />
                                                        </button>
                                                    )}
                                                    {page.h5?.length > 0 && (
                                                        <button
                                                            onClick={() => toggleHeadingExpansion(i, 'h5')}
                                                            className={cn(
                                                                "flex items-center text-[11px] p-2 rounded-xl border transition-all hover:bg-accent/50",
                                                                expandedHeadings[i] === 'h5' ? "bg-accent/50 border-primary/30" : "bg-accent/20 border-border/30"
                                                            )}
                                                        >
                                                            <span className="font-black text-muted-foreground mr-1.5">H5</span>
                                                            <span className="font-bold text-primary px-1.5 py-0.5 rounded-md bg-primary/10">{page.h5.length} items</span>
                                                            <ChevronDown className={cn("ml-1.5 h-3.5 w-3.5 text-muted-foreground transition-transform", expandedHeadings[i] === 'h5' && "rotate-180 text-primary")} />
                                                        </button>
                                                    )}
                                                    {page.h6?.length > 0 && (
                                                        <button
                                                            onClick={() => toggleHeadingExpansion(i, 'h6')}
                                                            className={cn(
                                                                "flex items-center text-[11px] p-2 rounded-xl border transition-all hover:bg-accent/50",
                                                                expandedHeadings[i] === 'h6' ? "bg-accent/50 border-primary/30" : "bg-accent/20 border-border/30"
                                                            )}
                                                        >
                                                            <span className="font-black text-muted-foreground mr-1.5">H6</span>
                                                            <span className="font-bold text-primary px-1.5 py-0.5 rounded-md bg-primary/10">{page.h6.length} items</span>
                                                            <ChevronDown className={cn("ml-1.5 h-3.5 w-3.5 text-muted-foreground transition-transform", expandedHeadings[i] === 'h6' && "rotate-180 text-primary")} />
                                                        </button>
                                                    )}
                                                </div>

                                                {/* Expanded Details View */}
                                                {expandedHeadings[i] && (
                                                    <div className="bg-accent/10 border border-border/40 rounded-2xl p-4 mt-2 animate-in slide-in-from-top-2 duration-200">
                                                        <h6 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-2">
                                                            Detail View: {expandedHeadings[i].toUpperCase()} Tags
                                                            <span className="h-px bg-border flex-1"></span>
                                                        </h6>
                                                        <div className="space-y-2">
                                                            {expandedHeadings[i] === 'h1' && (
                                                                <div className="text-sm font-medium text-foreground bg-background p-3 rounded-xl border border-border/50">
                                                                    {page.h1}
                                                                </div>
                                                            )}
                                                            {expandedHeadings[i] === 'h2' && page.h2?.map((text: string, hIndex: number) => (
                                                                <div key={hIndex} className="text-sm font-medium text-foreground bg-background p-3 rounded-xl border border-border/50 flex gap-3">
                                                                    <span className="text-[10px] font-black text-muted-foreground pt-0.5 shrink-0">{hIndex + 1}.</span>
                                                                    <span>{text}</span>
                                                                </div>
                                                            ))}
                                                            {expandedHeadings[i] === 'h3' && page.h3?.map((text: string, hIndex: number) => (
                                                                <div key={hIndex} className="text-sm font-medium text-foreground bg-background p-3 rounded-xl border border-border/50 flex gap-3">
                                                                    <span className="text-[10px] font-black text-muted-foreground pt-0.5 shrink-0">{hIndex + 1}.</span>
                                                                    <span>{text}</span>
                                                                </div>
                                                            ))}
                                                            {expandedHeadings[i] === 'h4' && page.h4?.map((text: string, hIndex: number) => (
                                                                <div key={hIndex} className="text-sm font-medium text-foreground bg-background p-3 rounded-xl border border-border/50 flex gap-3">
                                                                    <span className="text-[10px] font-black text-muted-foreground pt-0.5 shrink-0">{hIndex + 1}.</span>
                                                                    <span>{text}</span>
                                                                </div>
                                                            ))}
                                                            {expandedHeadings[i] === 'h5' && page.h5?.map((text: string, hIndex: number) => (
                                                                <div key={hIndex} className="text-sm font-medium text-foreground bg-background p-3 rounded-xl border border-border/50 flex gap-3">
                                                                    <span className="text-[10px] font-black text-muted-foreground pt-0.5 shrink-0">{hIndex + 1}.</span>
                                                                    <span>{text}</span>
                                                                </div>
                                                            ))}
                                                            {expandedHeadings[i] === 'h6' && page.h6?.map((text: string, hIndex: number) => (
                                                                <div key={hIndex} className="text-sm font-medium text-foreground bg-background p-3 rounded-xl border border-border/50 flex gap-3">
                                                                    <span className="text-[10px] font-black text-muted-foreground pt-0.5 shrink-0">{hIndex + 1}.</span>
                                                                    <span>{text}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                            
                            {/* In-view Proceed Button */}
                            {job?.status === 'awaiting_approval' && job?.generation_status === 'serp_analyzing' && (
                                <div className="mt-8 pt-8 border-t border-border/50 flex justify-center">
                                    <button
                                        onClick={handleProceed}
                                        className="flex items-center gap-3 px-10 py-4 bg-amber-500 text-white font-black rounded-2xl shadow-xl shadow-amber-500/20 hover:scale-[1.05] active:scale-95 transition-all uppercase tracking-tighter"
                                    >
                                        <ArrowRight className="h-5 w-5" /> Proceed to Content Brief
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Placeholder for pending or currently generating step without data yet */}
                {selectedViewStep === 'serp_analyzing' && !(job?.generation_data?.analysis) && !isFailed && (
                    <div className="h-64 rounded-[2.5rem] border-2 border-dashed border-border flex flex-col items-center justify-center text-muted-foreground space-y-4">
                        <Loader2 className="h-10 w-10 animate-spin text-primary" />
                        <p className="font-bold text-sm uppercase tracking-widest animate-pulse">Running competitive intelligence tools...</p>
                    </div>
                )}

                {/* Steps 3-6: Panels with inline Proceed buttons in Manual mode */}
                {(['briefing', 'writing', 'editing', 'humanizing'] as const).map((stepId) => {
                    const stepMeta = STEPS.find(s => s.id === stepId)!
                    const nextStepLabel =
                        stepId === 'briefing' ? 'Proceed to Writing' :
                        stepId === 'writing' ? 'Proceed to Editing' :
                        stepId === 'editing' ? 'Proceed to Humanizing' :
                        'Finish'
                    const isStepPaused = job?.status === 'awaiting_approval' && job?.generation_status === stepId
                    const isStepActive = job?.generation_status === stepId && job?.status === 'processing'

                    if (selectedViewStep !== stepId) return null

                    return (
                        <div key={stepId} className="bg-card rounded-[2.5rem] border border-border/50 overflow-hidden shadow-xl animate-in zoom-in-95 duration-500">
                            <div className="p-8 border-b border-border/50 flex items-center gap-4 bg-card/60">
                                <div className={cn(
                                    "p-3 rounded-2xl border",
                                    isStepPaused ? "bg-amber-500/10 border-amber-500/20" : "bg-primary/10 border-primary/20"
                                )}>
                                    <stepMeta.icon className={cn("h-6 w-6", isStepPaused ? "text-amber-500" : "text-primary")} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-black italic uppercase tracking-tight">{stepMeta.name}</h3>
                                    <p className="text-sm text-muted-foreground font-medium mt-1">{stepMeta.description}</p>
                                </div>
                                {isStepPaused && (
                                    <span className="ml-auto px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-amber-500/10 text-amber-600 border border-amber-500/20">
                                        Awaiting Approval
                                    </span>
                                )}
                            </div>
                            <div className="p-8">
                                {isStepActive && (
                                    <div className="flex flex-col items-center justify-center gap-4 py-8 text-muted-foreground">
                                        <Loader2 className="h-10 w-10 animate-spin text-primary" />
                                        <p className="font-bold text-sm uppercase tracking-widest animate-pulse">Running {stepMeta.name}...</p>
                                    </div>
                                )}
                                {!isStepActive && (
                                    <div className="flex flex-col items-center justify-center gap-3 py-8 text-muted-foreground">
                                        <div className="h-16 w-16 rounded-full bg-accent flex items-center justify-center">
                                            <stepMeta.icon className="h-8 w-8 opacity-40" />
                                        </div>
                                        <p className="font-bold text-sm uppercase tracking-widest">Step Completed</p>
                                        <p className="text-xs font-medium max-w-sm text-center opacity-70">AI-generated content for this step will appear here once the full pipeline is implemented.</p>
                                    </div>
                                )}
                                {isStepPaused && (
                                    <div className="mt-6 pt-6 border-t border-border/50 flex justify-center">
                                        <button
                                            onClick={handleProceed}
                                            className="flex items-center gap-3 px-10 py-4 bg-amber-500 text-white font-black rounded-2xl shadow-xl shadow-amber-500/20 hover:scale-[1.05] active:scale-95 transition-all uppercase tracking-tighter"
                                        >
                                            <ArrowRight className="h-5 w-5" /> {nextStepLabel}
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    )
                })}

                {!selectedViewStep && !isFailed && (
                    <div className="h-32 rounded-[2.5rem] border-2 border-dashed border-border flex items-center justify-center text-muted-foreground text-sm font-bold uppercase tracking-widest">
                        Select a completed step to view data
                    </div>
                )}
            </div>
        </div>
    )
}
