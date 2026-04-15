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
    Image,
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
    ArrowRight,
    Maximize2,
    Minimize2,
    Copy,
    Check,
    Eye,
    Code,
    RefreshCw
} from "lucide-react"
import { createClient } from "@/utils/supabase/client"
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { cn } from "@/utils/cn"
import { toast } from "sonner"
import { logUI } from "@/utils/logger"

const STEPS = [
    { id: 'serp_calling', name: 'SERP API Calling', icon: Search, description: 'Fetching Google search results' },
    { id: 'serp_analyzing', name: 'SERP Analyzer', icon: PieChart, description: 'Analyzing competitor content' },
    { id: 'briefing', name: 'Content Brief', icon: FileText, description: 'Generating article structure' },
    { id: 'writing', name: 'Writer Agent', icon: PenTool, description: 'AI Writing in progress' },
    { id: 'imaging', name: 'Image Agent', icon: Image, description: 'Generating & placing AI images' },
    { id: 'humanizing', name: 'Humanizer Agent', icon: UserCheck, description: 'Final persona polish' },
    { id: 'editing', name: 'Editor Agent', icon: Edit, description: 'Reviewing and refining' },
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
    const [expandedStepData, setExpandedStepData] = useState<string | null>(null)
    const [copiedStep, setCopiedStep] = useState<string | null>(null)
    const [showFormattedWriter, setShowFormattedWriter] = useState(false)
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

    const NEXT_STEP: Record<string, string> = {
        serp_calling: 'serp_analyzing',
        serp_analyzing: 'briefing',
        briefing: 'writing',
        writing: 'imaging',
        imaging: 'humanizing',
        humanizing: 'editing',
    }

    const handleCopy = (text: string, stepId: string) => {
        if (!text) return
        navigator.clipboard.writeText(text)
        setCopiedStep(stepId)
        toast.success("Copied to clipboard!")
        setTimeout(() => setCopiedStep(null), 2000)
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
                setJob((prev: any) => prev ? { ...prev, status: 'processing', generation_status: nextStep } : prev)
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
        setExpandedHeadings((prev: any) => ({
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
                                 job?.generation_status === 'writing' ? 'Proceed to Image Agent' :
                                 job?.generation_status === 'imaging' ? 'Proceed to Editing' :
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
                    const isRetrying = stepProgress?.status === 'retrying'
                    const isPaused = job?.status === 'awaiting_approval' && job?.generation_status === step.id
                    const isCurrent = (job?.generation_status === step.id && job?.status === 'processing') || isPaused || isRetrying
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
                                    isRetrying ? "bg-orange-500/5 border-orange-500/30 shadow-lg shadow-orange-500/5" :
                                    isPaused ? "bg-amber-500/5 border-amber-500/20 shadow-lg shadow-amber-500/5" :
                                        isCurrent ? "bg-primary/5 border-primary/30 shadow-lg shadow-primary/5 scale-[1.02]" :
                                            "bg-card/50 border-border/50"
                            )}
                        >
                            <div className="flex flex-col items-center text-center space-y-3 relative z-10">
                                <div className={cn(
                                    "h-12 w-12 rounded-2xl flex items-center justify-center transition-all duration-500",
                                    isDone ? "bg-emerald-500 text-white" :
                                        isRetrying ? "bg-orange-500 text-white" :
                                        isPaused ? "bg-amber-500 text-white" :
                                            isCurrent ? "bg-primary text-white shadow-[0_0_15px_rgba(var(--primary),0.5)]" :
                                                "bg-accent text-muted-foreground"
                                )}>
                                    {isDone ? <CheckCircle2 className="h-6 w-6" /> :
                                     isRetrying ? <RefreshCw className="h-6 w-6 animate-spin" /> :
                                     isPaused ? <Clock className="h-6 w-6" /> :
                                     <step.icon className={cn("h-6 w-6", isCurrent ? "animate-pulse" : "")} />}
                                </div>
                                <div>
                                    <h3 className="font-black text-sm uppercase tracking-tight">{step.name}</h3>
                                    <p className="text-[10px] font-medium text-muted-foreground mt-1">{step.description}</p>
                                    {isRetrying && stepProgress?.attempt && (
                                        <span className="inline-block mt-1.5 px-2 py-0.5 rounded-full bg-orange-500/10 text-orange-600 border border-orange-500/20 text-[9px] font-black uppercase tracking-widest">
                                            Retrying {stepProgress.attempt}/{stepProgress.max_attempts}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Processing Animation Line */}
                            {isCurrent && !isPaused && !isRetrying && (
                                <div className="absolute bottom-0 left-0 h-1 bg-primary animate-shimmer" style={{ width: '100%' }} />
                            )}
                            {/* Retrying pulse line */}
                            {isRetrying && (
                                <div className="absolute bottom-0 left-0 h-1 bg-orange-500 animate-pulse" style={{ width: '100%' }} />
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
```
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

                {/* Steps 3-7: Panels with inline Proceed buttons in Manual mode */}
                {(['briefing', 'writing', 'imaging', 'humanizing', 'editing'] as const).map((stepId) => {
                    const stepMeta = STEPS.find(s => s.id === stepId)!
                    const nextStepLabel =
                        stepId === 'briefing' ? 'Proceed to Writing' :
                        stepId === 'writing' ? 'Proceed to Image Agent' :
                        stepId === 'imaging' ? 'Proceed to Humanizer' :
                        stepId === 'humanizing' ? 'Proceed to Editing' :
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
                                {isStepActive && (() => {
                                    const stepProgress = job?.generation_progress?.[stepId]
                                    const isStepRetrying = stepProgress?.status === 'retrying'
                                    return (
                                        <div className="flex flex-col items-center justify-center gap-4 py-8 text-muted-foreground">
                                            {isStepRetrying ? (
                                                <>
                                                    {/* Retrying Warning Box */}
                                                    <div className="w-full max-w-md p-5 rounded-2xl bg-orange-500/5 border border-orange-500/20 flex flex-col items-center gap-3 text-center">
                                                        <div className="flex items-center gap-2 text-orange-600">
                                                            <AlertCircle className="h-5 w-5 shrink-0" />
                                                            <h4 className="font-black uppercase tracking-tight text-sm">Kie API Temporarily Unavailable</h4>
                                                        </div>
                                                        <p className="text-xs font-medium text-orange-700/80">
                                                            {stepProgress?.message || 'Network error or maintenance. Auto-retrying...'}
                                                        </p>
                                                        <div className="flex items-center gap-3 mt-1">
                                                            <span className="px-3 py-1 rounded-full bg-orange-500/10 text-orange-600 border border-orange-500/20 text-[10px] font-black uppercase tracking-widest">
                                                                Attempt {stepProgress?.attempt ?? '?'} / {stepProgress?.max_attempts ?? 3}
                                                            </span>
                                                            <RefreshCw className="h-4 w-4 text-orange-500 animate-spin" />
                                                        </div>
                                                    </div>
                                                    <p className="text-[11px] font-medium text-muted-foreground/60 mt-1">Job will resume automatically. No action needed.</p>
                                                </>
                                            ) : (
                                                <>
                                                    <Loader2 className="h-10 w-10 animate-spin text-primary" />
                                                    <p className="font-bold text-sm uppercase tracking-widest animate-pulse">Running {stepMeta.name}...</p>
                                                </>
                                            )}
                                        </div>
                                    )
                                })()}

                                {!isStepActive && job?.generation_data?.competitor_analysis && (
                                    <>
                                        {/* Standard View */}
                                        <div className={cn(
                                            "rounded-[2rem] bg-accent/5 border border-border/30 text-left transition-all duration-500 relative z-10",
                                            expandedStepData === 'serp_analyzing' ? "hidden" : "p-6 sm:p-8"
                                        )}>
                                            <div className="flex items-center justify-between mb-8 pb-6 border-b border-border/50">
                                                <div className="flex items-center gap-4">
                                                    <div className="p-3 bg-primary/10 rounded-2xl border border-primary/20 shadow-inner">
                                                        <Zap className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm font-black uppercase tracking-widest text-foreground">Competitor Analysis</h4>
                                                    </div>
                                                </div>
                                                <button 
                                                    onClick={() => setExpandedStepData('serp_analyzing')}
                                                    className="p-3 rounded-2xl bg-card border hover:bg-accent transition-all shadow-sm flex items-center justify-center title='Maximize view'"
                                                >
                                                    <Maximize2 className="h-4 w-4" />
                                                </button>
                                            </div>

                                            <div className="max-h-[500px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                                                <div className="space-y-4">
                                                    {job.generation_data.competitor_analysis.map((page: any, i: number) => (
                                                        <div key={i} className="rounded-2xl border border-border/50 bg-card overflow-hidden">
                                                            {/* Accordion content elided below -> full representation shown */}
                                                            <div 
                                                                className="w-full text-left p-4 sm:p-5 flex items-center justify-between cursor-pointer hover:bg-accent/30 transition-colors"
                                                                onClick={() => setExpandedHeadings(prev => ({
                                                                    ...prev,
                                                                    [i]: prev[i] ? null : 'h1'
                                                                }))}
                                                            >
                                                                <div className="flex items-center gap-4 pr-4">
                                                                    <div className="hidden sm:flex h-10 w-10 rounded-xl bg-accent items-center justify-center text-muted-foreground font-black text-xs shrink-0">
                                                                        #{i + 1}
                                                                    </div>
                                                                    <div>
                                                                        <div className="flex items-center gap-2 mb-1">
                                                                            <Globe className="h-3 w-3 text-muted-foreground" />
                                                                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">{new URL(page.url).hostname.replace('www.', '')}</span>
                                                                        </div>
                                                                        <h5 className="font-bold text-sm text-foreground/90 leading-tight">{page.title || 'Untitled Page'}</h5>
                                                                        <div className="flex items-center gap-3 mt-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                                                                            <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> {(page.content || '').length} length</span>
                                                                            <span>•</span>
                                                                            <span>{Object.keys(page.headings || {}).reduce((acc, level) => acc + (page.headings[level]?.length || 0), 0)} Headings</span>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                                <div className={cn(
                                                                    "p-2 rounded-xl transition-all duration-300 border shadow-sm",
                                                                    expandedHeadings[i] ? "bg-primary text-primary-foreground border-primary rotate-180" : "bg-card text-muted-foreground border-border/50 hover:bg-accent"
                                                                )}>
                                                                    <ChevronDown className="h-4 w-4" />
                                                                </div>
                                                            </div>
                                                            
                                                            {/* Expanded Headings Content */}
                                                            {expandedHeadings[i] && (
                                                                <div className="border-t border-border/50 bg-accent/5 p-4 sm:p-6 animate-in slide-in-from-top-2 duration-200">
                                                                    {page.headings ? (
                                                                        <div className="space-y-6">
                                                                            {Object.entries(page.headings).map(([level, items]: [string, any]) => {
                                                                                if (!items || items.length === 0) return null;
                                                                                return (
                                                                                    <div key={level}>
                                                                                        <h6 className="text-[10px] font-black uppercase tracking-widest text-primary mb-3 flex items-center gap-2">
                                                                                            <span className="h-px bg-primary/20 flex-1"></span>
                                                                                            {level.toUpperCase()}
                                                                                            <span className="h-px bg-primary/20 flex-1"></span>
                                                                                        </h6>
                                                                                        <ul className="space-y-2">
                                                                                            {items.map((heading: string, hIdx: number) => (
                                                                                                <li key={hIdx} className="text-sm font-medium text-foreground/80 leading-relaxed flex items-start gap-2">
                                                                                                    <span className="text-primary mt-1 opacity-50">•</span>
                                                                                                    <span>{heading}</span>
                                                                                                </li>
                                                                                            ))}
                                                                                        </ul>
                                                                                    </div>
                                                                                )
                                                                            })}
                                                                        </div>
                                                                    ) : (
                                                                        <div className="text-sm text-muted-foreground italic text-center py-4">No headings found on this page.</div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Expanded Full-Screen Overlay */}
                                        {expandedStepData === 'serp_analyzing' && (
                                            <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-200">
                                                <div className="bg-card w-full max-w-5xl h-full shadow-2xl rounded-[2.5rem] flex flex-col overflow-hidden border border-border/50 animate-in zoom-in-95 duration-300">
                                                    <div className="p-6 sm:p-8 border-b border-border/50 bg-card/60 flex items-center justify-between">
                                                        <div className="flex items-center gap-4">
                                                            <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20 shadow-inner">
                                                                <Zap className="h-6 w-6 text-primary" />
                                                            </div>
                                                            <div>
                                                                <h4 className="text-base sm:text-lg font-black uppercase tracking-widest text-foreground">Competitor Analysis</h4>
                                                                <p className="text-xs font-medium text-muted-foreground mt-1">Detailed heading structure for {job.generation_data.competitor_analysis.length} pages</p>
                                                            </div>
                                                        </div>
                                                        <button 
                                                            onClick={() => setExpandedStepData(null)}
                                                            className="p-3 rounded-2xl bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-all shadow-sm flex items-center justify-center title='Minimize view'"
                                                        >
                                                            <Minimize2 className="h-4 sm:h-5 w-4 sm:w-5" />
                                                        </button>
                                                    </div>
                                                    <div className="flex-1 overflow-y-auto p-6 sm:p-8 bg-accent/5 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                                                        <div className="space-y-6">
                                                            {job.generation_data.competitor_analysis.map((page: any, i: number) => (
                                                                <div key={i} className="rounded-2xl border border-border/50 bg-card overflow-hidden transition-all shadow-sm shadow-black/5 hover:border-primary/20 hover:shadow-md">
                                                                    <div 
                                                                        className="w-full text-left p-6 sm:p-8 flex items-center justify-between cursor-pointer hover:bg-accent/30 transition-colors"
                                                                        onClick={() => setExpandedHeadings(prev => ({
                                                                            ...prev,
                                                                            [i]: prev[i] ? null : 'h1'
                                                                        }))}
                                                                    >
                                                                        <div className="flex items-center gap-6 pr-4">
                                                                            <div className="hidden sm:flex h-14 w-14 rounded-2xl bg-accent items-center justify-center text-muted-foreground font-black text-lg shrink-0 border border-border/50">
                                                                                #{i + 1}
                                                                            </div>
                                                                            <div>
                                                                                <div className="flex items-center gap-2 mb-2">
                                                                                    <Globe className="h-4 w-4 text-muted-foreground" />
                                                                                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{new URL(page.url).hostname.replace('www.', '')}</span>
                                                                                </div>
                                                                                <h5 className="font-bold text-lg text-foreground/90 leading-tight mb-3">{page.title || 'Untitled Page'}</h5>
                                                                                <div className="flex items-center gap-4 text-xs font-bold text-muted-foreground uppercase tracking-widest">
                                                                                    <span className="flex items-center gap-1.5 bg-accent/50 px-3 py-1.5 rounded-lg border border-border/50"><FileText className="h-3 w-3" /> {(page.content || '').length} length</span>
                                                                                    <span className="flex items-center gap-1.5 bg-accent/50 px-3 py-1.5 rounded-lg border border-border/50">{Object.keys(page.headings || {}).reduce((acc, level) => acc + (page.headings[level]?.length || 0), 0)} Headings</span>
                                                                                </div>
                                                                            </div>
                                                                        </div>
                                                                        <div className={cn(
                                                                            "p-3 rounded-xl transition-all duration-300 border shadow-sm",
                                                                            expandedHeadings[i] ? "bg-primary text-primary-foreground border-primary rotate-180" : "bg-card text-muted-foreground border-border/50 hover:bg-accent"
                                                                        )}>
                                                                            <ChevronDown className="h-5 w-5" />
                                                                        </div>
                                                                    </div>
                                                                    
                                                                    {expandedHeadings[i] && (
                                                                        <div className="border-t border-border/50 bg-accent/5 p-6 sm:p-8 animate-in slide-in-from-top-4 duration-300">
                                                                            {page.headings ? (
                                                                                <div className="space-y-8">
                                                                                    {Object.entries(page.headings).map(([level, items]: [string, any]) => {
                                                                                        if (!items || items.length === 0) return null;
                                                                                        return (
                                                                                            <div key={level} className="bg-card p-6 rounded-2xl border border-border/50 shadow-sm">
                                                                                                <h6 className="text-xs font-black uppercase tracking-widest text-primary mb-4 flex items-center gap-4">
                                                                                                    <span className="bg-primary/10 text-primary px-3 py-1 rounded-lg border border-primary/20 shrink-0">{level.toUpperCase()}</span>
                                                                                                    <span className="h-px bg-border flex-1"></span>
                                                                                                </h6>
                                                                                                <ul className="space-y-3">
                                                                                                    {items.map((heading: string, hIdx: number) => (
                                                                                                        <li key={hIdx} className="text-base font-medium text-foreground/80 flex items-start gap-4 p-3 rounded-xl hover:bg-accent/50 transition-colors border border-transparent hover:border-border/50">
                                                                                                            <div className="h-6 w-6 rounded-full bg-accent flex items-center justify-center shrink-0 mt-0.5">
                                                                                                                <span className="text-[10px] font-bold text-muted-foreground">{hIdx + 1}</span>
                                                                                                            </div>
                                                                                                            <span className="leading-relaxed">{heading}</span>
                                                                                                        </li>
                                                                                                    ))}
                                                                                                </ul>
                                                                                            </div>
                                                                                        )
                                                                                    })}
                                                                                </div>
                                                                            ) : (
                                                                                <div className="text-sm text-muted-foreground italic text-center py-8 bg-card rounded-2xl border border-border/50 border-dashed">No headings found on this page.</div>
                                                                            )}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                                {!isStepActive && stepId === 'briefing' && job?.generation_data?.brief && (
                                    <>
                                        {/* Standard View */}
                                        <div className={cn(
                                            "rounded-[2rem] bg-accent/5 border border-border/30 text-left transition-all duration-500 relative z-10",
                                            expandedStepData === 'briefing' ? "hidden" : "p-8"
                                        )}>
                                            <div className="flex items-center justify-between mb-6 pb-6 border-b border-border/50">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
                                                        <FileText className="h-5 w-5 text-primary" />
                                                    </div>
                                                    <h4 className="text-sm font-black uppercase tracking-widest text-foreground">Generated Content Brief</h4>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button 
                                                        onClick={() => handleCopy(
                                                            typeof job.generation_data.brief === 'string' ? job.generation_data.brief : JSON.stringify(job.generation_data.brief, null, 2),
                                                            'briefing'
                                                        )}
                                                        className="p-3 rounded-2xl bg-card border hover:bg-accent transition-all shadow-sm flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-foreground/80"
                                                    >
                                                        {copiedStep === 'briefing' ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />} 
                                                        <span className="hidden sm:inline">{copiedStep === 'briefing' ? 'Copied' : 'Copy'}</span>
                                                    </button>
                                                    <button 
                                                        onClick={() => setExpandedStepData('briefing')}
                                                        className="p-3 rounded-2xl bg-card border hover:bg-accent transition-all shadow-sm flex items-center justify-center title='Maximize view'"
                                                    >
                                                        <Maximize2 className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="max-h-[500px] overflow-y-auto pr-4 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
                                                <div className="prose prose-sm dark:prose-invert max-w-none">
                                                    <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-foreground/90 bg-transparent p-0 border-none">
                                                        {typeof job.generation_data.brief === 'string' 
                                                            ? job.generation_data.brief 
                                                            : JSON.stringify(job.generation_data.brief, null, 2)}
                                                    </pre>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Expanded Full-Screen Overlay */}
                                        {expandedStepData === 'briefing' && (
                                            <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-200">
                                                <div className="bg-card w-full max-w-5xl h-full shadow-2xl rounded-[2.5rem] flex flex-col overflow-hidden border border-border/50 animate-in zoom-in-95 duration-300">
                                                    <div className="p-6 sm:p-8 border-b border-border/50 bg-card/60 flex items-center justify-between">
                                                        <div className="flex items-center gap-4">
                                                            <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20 shadow-inner">
                                                                <FileText className="h-6 w-6 text-primary" />
                                                            </div>
                                                            <div>
                                                                <h4 className="text-base sm:text-lg font-black uppercase tracking-widest text-foreground">Generated Content Brief</h4>
                                                                <p className="text-xs font-medium text-muted-foreground mt-1">Reading Mode</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2 sm:gap-3">
                                                            <button 
                                                                onClick={() => handleCopy(
                                                                    typeof job.generation_data.brief === 'string' ? job.generation_data.brief : JSON.stringify(job.generation_data.brief, null, 2),
                                                                    'briefing_max'
                                                                )}
                                                                className="p-3 sm:px-5 sm:py-3 rounded-2xl bg-card border hover:bg-accent transition-all shadow-sm flex items-center gap-2 text-[10px] sm:text-xs font-black uppercase tracking-widest text-foreground/80"
                                                            >
                                                                {copiedStep === 'briefing_max' ? <Check className="h-4 sm:h-5 w-4 sm:w-5 text-green-500" /> : <Copy className="h-4 sm:h-5 w-4 sm:w-5" />} 
                                                                <span className="hidden sm:inline">{copiedStep === 'briefing_max' ? 'Copied' : 'Copy text'}</span>
                                                            </button>
                                                            <button 
                                                                onClick={() => setExpandedStepData(null)}
                                                                className="p-3 rounded-2xl bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-all shadow-sm flex items-center justify-center title='Minimize view'"
                                                            >
                                                                <Minimize2 className="h-4 sm:h-5 w-4 sm:w-5" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="flex-1 overflow-y-auto p-6 sm:p-12 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent bg-card">
                                                        <div className="max-w-[800px] mx-auto custom-article-view">
                                                            <div className="prose prose-sm sm:prose-base lg:prose-lg dark:prose-invert max-w-none">
                                                                <pre className="whitespace-pre-wrap font-sans text-sm sm:text-base leading-relaxed text-foreground/90 bg-transparent p-0 border-none">
                                                                    {typeof job.generation_data.brief === 'string' 
                                                                        ? job.generation_data.brief 
                                                                        : JSON.stringify(job.generation_data.brief, null, 2)}
                                                                </pre>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                                {!isStepActive && stepId === 'writing' && job?.generation_data?.article_content && (
                                    <>
                                        {/* Standard View */}
                                        <div className={cn(
                                            "rounded-[2rem] bg-accent/5 border border-border/30 text-left transition-all duration-500 relative z-10",
                                            expandedStepData === 'writing' ? "hidden" : "p-8"
                                        )}>
                                            <div className="flex items-center justify-between mb-6 pb-6 border-b border-border/50">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
                                                        <PenTool className="h-5 w-5 text-primary" />
                                                    </div>
                                                    <h4 className="text-sm font-black uppercase tracking-widest text-foreground">Generated Full Article</h4>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button 
                                                        onClick={() => setShowFormattedWriter(!showFormattedWriter)}
                                                        className="p-3 rounded-2xl bg-card border hover:bg-accent transition-all shadow-sm flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-foreground/80"
                                                    >
                                                        {showFormattedWriter ? <Code className="h-4 w-4" /> : <Eye className="h-4 w-4" />} 
                                                        <span className="hidden sm:inline">{showFormattedWriter ? 'Raw Markdown' : 'Formatted View'}</span>
                                                    </button>
                                                    <button 
                                                        onClick={() => handleCopy(job.generation_data.article_content, 'writing')}
                                                        className="p-3 rounded-2xl bg-card border hover:bg-accent transition-all shadow-sm flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-foreground/80"
                                                    >
                                                        {copiedStep === 'writing' ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />} 
                                                        <span className="hidden sm:inline">{copiedStep === 'writing' ? 'Copied' : 'Copy'}</span>
                                                    </button>
                                                    <button 
                                                        onClick={() => setExpandedStepData('writing')}
                                                        className="p-3 rounded-2xl bg-card border hover:bg-accent transition-all shadow-sm flex items-center justify-center title='Maximize view'"
                                                    >
                                                        <Maximize2 className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className={cn("max-h-[500px] overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent custom-article-view pr-4", showFormattedWriter ? "bg-accent/5 p-6 rounded-2xl" : "")}>
                                                {!showFormattedWriter ? (
                                                    <div className="font-mono text-sm text-foreground/90">
                                                        {job.generation_data.article_content.split('\n').map((line: string, i: number) => {
                                                            const isHeading = line.trim().startsWith('#');
                                                            const isEmpty = line.trim() === '';
                                                            return (
                                                                <div 
                                                                    key={i} 
                                                                    className={cn(
                                                                        "whitespace-pre-wrap break-words",
                                                                        isHeading ? "mt-6 mb-3 font-black text-primary text-base" : "mb-4 leading-relaxed",
                                                                        isEmpty ? "h-2 mb-0" : ""
                                                                    )}
                                                                >
                                                                    {line}
                                                                </div>
                                                            )
                                                        })}
                                                    </div>
                                                ) : (
                                                    <div className="prose prose-slate dark:prose-invert max-w-none prose-p:leading-relaxed prose-headings:font-semibold prose-a:text-blue-600">
                                                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                            {job.generation_data.article_content}
                                                        </ReactMarkdown>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Expanded Full-Screen Overlay */}
                                        {expandedStepData === 'writing' && (
                                            <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-200">
                                                <div className="bg-card w-full max-w-5xl h-full shadow-2xl rounded-[2.5rem] flex flex-col overflow-hidden border border-border/50 animate-in zoom-in-95 duration-300">
                                                    <div className="p-6 sm:p-8 border-b border-border/50 bg-card/60 flex items-center justify-between">
                                                        <div className="flex items-center gap-4">
                                                            <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20 shadow-inner">
                                                                <PenTool className="h-6 w-6 text-primary" />
                                                            </div>
                                                            <div>
                                                                <h4 className="text-base sm:text-lg font-black uppercase tracking-widest text-foreground">Generated Full Article</h4>
                                                                <p className="text-xs font-medium text-muted-foreground mt-1">Reading Mode</p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2 sm:gap-3">
                                                            <button 
                                                                onClick={() => setShowFormattedWriter(!showFormattedWriter)}
                                                                className="p-3 sm:px-5 sm:py-3 rounded-2xl bg-card border hover:bg-accent transition-all shadow-sm flex items-center gap-2 text-[10px] sm:text-xs font-black uppercase tracking-widest text-foreground/80"
                                                            >
                                                                {showFormattedWriter ? <Code className="h-4 sm:h-5 w-4 sm:w-5" /> : <Eye className="h-4 sm:h-5 w-4 sm:w-5" />} 
                                                                <span className="hidden sm:inline">{showFormattedWriter ? 'Raw Markdown' : 'Formatted View'}</span>
                                                            </button>
                                                            <button 
                                                                onClick={() => handleCopy(job.generation_data.article_content, 'writing_max')}
                                                                className="p-3 sm:px-5 sm:py-3 rounded-2xl bg-card border hover:bg-accent transition-all shadow-sm flex items-center gap-2 text-[10px] sm:text-xs font-black uppercase tracking-widest text-foreground/80"
                                                            >
                                                                {copiedStep === 'writing_max' ? <Check className="h-4 sm:h-5 w-4 sm:w-5 text-green-500" /> : <Copy className="h-4 sm:h-5 w-4 sm:w-5" />} 
                                                                <span className="hidden sm:inline">{copiedStep === 'writing_max' ? 'Copied' : 'Copy text'}</span>
                                                            </button>
                                                            <button 
                                                                onClick={() => setExpandedStepData(null)}
                                                                className="p-3 rounded-2xl bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-all shadow-sm flex items-center justify-center title='Minimize view'"
                                                            >
                                                                <Minimize2 className="h-4 sm:h-5 w-4 sm:w-5" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="flex-1 overflow-y-auto p-6 sm:p-12 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent bg-card">
                                                        <div className="max-w-[800px] mx-auto custom-article-view">
                                                            {!showFormattedWriter ? (
                                                                <div className="font-mono text-sm sm:text-base text-foreground/90">
                                                                    {job.generation_data.article_content.split('\n').map((line: string, i: number) => {
                                                                        const isHeading = line.trim().startsWith('#');
                                                                        const isEmpty = line.trim() === '';
                                                                        return (
                                                                            <div 
                                                                                key={i} 
                                                                                className={cn(
                                                                                    "whitespace-pre-wrap break-words",
                                                                                    isHeading ? "mt-8 mb-4 font-black text-primary text-lg" : "mb-5 leading-[1.8]",
                                                                                    isEmpty ? "h-4 mb-0" : ""
                                                                                )}
                                                                            >
                                                                                {line}
                                                                            </div>
                                                                        )
                                                                    })}
                                                                </div>
                                                            ) : (
                                                                <div className="prose prose-base sm:prose-lg prose-slate dark:prose-invert max-w-none prose-p:leading-relaxed prose-headings:font-semibold prose-a:text-blue-600">
                                                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                                                        {job.generation_data.article_content}
                                                                    </ReactMarkdown>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                                {!isStepActive && stepId === 'imaging' && job?.generation_data?.imaging && (
                                    <>
                                        {/* Image summary bar */}
                                        <div className="flex flex-wrap items-center gap-3 mb-6 pb-6 border-b border-border/50">
                                            <div className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
                                                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                                                <span className="text-xs font-black uppercase tracking-widest text-emerald-600">
                                                    {job.generation_data.imaging.images_generated} / {job.generation_data.imaging.images_count} Images Generated
                                                </span>
                                            </div>
                                            {job.generation_data.imaging.image_urls?.map((img: any) => (
                                                <a
                                                    key={img.number}
                                                    href={img.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-card border border-border/50 hover:border-primary/30 transition-all text-[10px] font-black uppercase tracking-widest text-muted-foreground hover:text-primary"
                                                >
                                                    <Image className="h-3 w-3" />
                                                    #{img.number} {img.type}
                                                    <ExternalLink className="h-2.5 w-2.5" />
                                                </a>
                                            ))}
                                        </div>

                                        {/* Standard View — Full Article with Images */}
                                        <div className={cn(
                                            "rounded-[2rem] bg-accent/5 border border-border/30 text-left transition-all duration-500 relative z-10",
                                            expandedStepData === 'imaging' ? "hidden" : "p-8"
                                        )}>
                                            <div className="flex items-center justify-between mb-6 pb-6 border-b border-border/50">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2 rounded-xl bg-primary/10 border border-primary/20">
                                                        <Image className="h-5 w-5 text-primary" />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm font-black uppercase tracking-widest text-foreground">Article with AI Images</h4>
                                                        <p className="text-[10px] text-muted-foreground font-medium mt-0.5">Full article with [IMAGE] placeholders replaced by live R2 images</p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => handleCopy(job.generation_data.imaging.article_with_images, 'imaging')}
                                                        className="p-3 rounded-2xl bg-card border hover:bg-accent transition-all shadow-sm flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-foreground/80"
                                                    >
                                                        {copiedStep === 'imaging' ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                                                        <span className="hidden sm:inline">{copiedStep === 'imaging' ? 'Copied' : 'Copy'}</span>
                                                    </button>
                                                    <button
                                                        onClick={() => setExpandedStepData('imaging')}
                                                        className="p-3 rounded-2xl bg-card border hover:bg-accent transition-all shadow-sm flex items-center justify-center"
                                                    >
                                                        <Maximize2 className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="max-h-[600px] overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent pr-4 custom-article-view">
                                                <div className="prose prose-base dark:prose-invert max-w-none prose-p:leading-relaxed prose-headings:font-semibold prose-img:rounded-2xl prose-img:shadow-lg prose-figure:my-8">
                                                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                                                        {job.generation_data.imaging.article_with_images}
                                                    </ReactMarkdown>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Expanded Full-Screen Overlay */}
                                        {expandedStepData === 'imaging' && (
                                            <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-200">
                                                <div className="bg-card w-full max-w-5xl h-full shadow-2xl rounded-[2.5rem] flex flex-col overflow-hidden border border-border/50 animate-in zoom-in-95 duration-300">
                                                    <div className="p-6 sm:p-8 border-b border-border/50 bg-card/60 flex items-center justify-between">
                                                        <div className="flex items-center gap-4">
                                                            <div className="p-3 rounded-2xl bg-primary/10 border border-primary/20 shadow-inner">
                                                                <Image className="h-6 w-6 text-primary" />
                                                            </div>
                                                            <div>
                                                                <h4 className="text-base sm:text-lg font-black uppercase tracking-widest text-foreground">Article with AI Images</h4>
                                                                <p className="text-xs font-medium text-muted-foreground mt-1">
                                                                    {job.generation_data.imaging.images_generated} images embedded • Full reading mode
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={() => handleCopy(job.generation_data.imaging.article_with_images, 'imaging_max')}
                                                                className="p-3 sm:px-5 sm:py-3 rounded-2xl bg-card border hover:bg-accent transition-all shadow-sm flex items-center gap-2 text-[10px] sm:text-xs font-black uppercase tracking-widest text-foreground/80"
                                                            >
                                                                {copiedStep === 'imaging_max' ? <Check className="h-4 sm:h-5 w-4 sm:w-5 text-green-500" /> : <Copy className="h-4 sm:h-5 w-4 sm:w-5" />}
                                                                <span className="hidden sm:inline">{copiedStep === 'imaging_max' ? 'Copied' : 'Copy HTML'}</span>
                                                            </button>
                                                            <button
                                                                onClick={() => setExpandedStepData(null)}
                                                                className="p-3 rounded-2xl bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-all shadow-sm flex items-center justify-center"
                                                            >
                                                                <Minimize2 className="h-4 sm:h-5 w-4 sm:w-5" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="flex-1 overflow-y-auto p-6 sm:p-12 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent bg-card">
                                                        <div className="max-w-[800px] mx-auto custom-article-view">
                                                            <div className="prose prose-base sm:prose-lg prose-slate dark:prose-invert max-w-none prose-p:leading-relaxed prose-headings:font-semibold prose-img:rounded-2xl prose-img:shadow-xl prose-figure:my-10 prose-figcaption:text-center prose-figcaption:text-sm prose-figcaption:text-muted-foreground">
                                                                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                                                                    {job.generation_data.imaging.article_with_images}
                                                                </ReactMarkdown>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                                {!isStepActive && stepId === 'humanizing' && job?.generation_data?.humanized_content && (
                                    <>
                                        {/* Humanized Content */}
                                        <div className={cn(
                                            "rounded-[2rem] bg-accent/5 border border-border/30 text-left transition-all duration-500 relative z-10",
                                            expandedStepData === 'humanizing' ? "hidden" : "p-8"
                                        )}>
                                            <div className="flex items-center justify-between mb-6 pb-6 border-b border-border/50">
                                                <div className="flex items-center gap-3">
                                                    <div className="p-2 rounded-xl bg-violet-500/10 border border-violet-500/20">
                                                        <UserCheck className="h-5 w-5 text-violet-500" />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-sm font-black uppercase tracking-widest text-foreground">Humanized Article</h4>
                                                        <p className="text-[10px] text-muted-foreground font-medium mt-0.5">
                                                            {job.generation_data.humanized_content.split(/\s+/).length.toLocaleString()} words · AI-humanized output
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <button
                                                        onClick={() => handleCopy(job.generation_data.humanized_content, 'humanizing')}
                                                        className="p-3 rounded-2xl bg-card border hover:bg-accent transition-all shadow-sm flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-foreground/80"
                                                    >
                                                        {copiedStep === 'humanizing' ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                                                        <span className="hidden sm:inline">{copiedStep === 'humanizing' ? 'Copied' : 'Copy'}</span>
                                                    </button>
                                                    <button
                                                        onClick={() => setExpandedStepData('humanizing')}
                                                        className="p-3 rounded-2xl bg-card border hover:bg-accent transition-all shadow-sm flex items-center justify-center"
                                                    >
                                                        <Maximize2 className="h-4 w-4" />
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="max-h-[600px] overflow-y-auto scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent pr-4 custom-article-view">
                                                <div className="prose prose-base dark:prose-invert max-w-none prose-p:leading-relaxed prose-headings:font-semibold prose-img:rounded-2xl prose-img:shadow-lg">
                                                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                                                        {job.generation_data.humanized_content}
                                                    </ReactMarkdown>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Expanded Full-Screen Overlay */}
                                        {expandedStepData === 'humanizing' && (
                                            <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8 animate-in fade-in duration-200">
                                                <div className="bg-card w-full max-w-5xl h-full shadow-2xl rounded-[2.5rem] flex flex-col overflow-hidden border border-border/50 animate-in zoom-in-95 duration-300">
                                                    <div className="p-6 sm:p-8 border-b border-border/50 bg-card/60 flex items-center justify-between">
                                                        <div className="flex items-center gap-4">
                                                            <div className="p-3 rounded-2xl bg-violet-500/10 border border-violet-500/20 shadow-inner">
                                                                <UserCheck className="h-6 w-6 text-violet-500" />
                                                            </div>
                                                            <div>
                                                                <h4 className="text-base sm:text-lg font-black uppercase tracking-widest text-foreground">Humanized Article</h4>
                                                                <p className="text-xs font-medium text-muted-foreground mt-1">
                                                                    {job.generation_data.humanized_content.split(/\s+/).length.toLocaleString()} words · Full reading mode
                                                                </p>
                                                            </div>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={() => handleCopy(job.generation_data.humanized_content, 'humanizing_max')}
                                                                className="p-3 sm:px-5 sm:py-3 rounded-2xl bg-card border hover:bg-accent transition-all shadow-sm flex items-center gap-2 text-[10px] sm:text-xs font-black uppercase tracking-widest text-foreground/80"
                                                            >
                                                                {copiedStep === 'humanizing_max' ? <Check className="h-4 sm:h-5 w-4 sm:w-5 text-green-500" /> : <Copy className="h-4 sm:h-5 w-4 sm:w-5" />}
                                                                <span className="hidden sm:inline">{copiedStep === 'humanizing_max' ? 'Copied' : 'Copy'}</span>
                                                            </button>
                                                            <button
                                                                onClick={() => setExpandedStepData(null)}
                                                                className="p-3 rounded-2xl bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-all shadow-sm flex items-center justify-center"
                                                            >
                                                                <Minimize2 className="h-4 sm:h-5 w-4 sm:w-5" />
                                                            </button>
                                                        </div>
                                                    </div>
                                                    <div className="flex-1 overflow-y-auto p-6 sm:p-12 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent bg-card">
                                                        <div className="max-w-[800px] mx-auto custom-article-view">
                                                            <div className="prose prose-base sm:prose-lg prose-slate dark:prose-invert max-w-none prose-p:leading-relaxed prose-headings:font-semibold prose-img:rounded-2xl prose-img:shadow-xl">
                                                                <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                                                                    {job.generation_data.humanized_content}
                                                                </ReactMarkdown>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                                {!isStepActive && (!job?.generation_data?.brief && stepId === 'briefing' || !job?.generation_data?.article_content && stepId === 'writing' || !job?.generation_data?.imaging && stepId === 'imaging' || !job?.generation_data?.humanized_content && stepId === 'humanizing' || (stepId !== 'briefing' && stepId !== 'writing' && stepId !== 'imaging' && stepId !== 'humanizing')) && (
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
