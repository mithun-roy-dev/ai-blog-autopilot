"use client"

import { useState, useEffect } from "react"
import { FileText, Globe, Zap, ArrowUpRight, TrendingUp, Loader2 } from "lucide-react"
import { createClient } from "@/utils/supabase/client"
import { cn } from "@/utils/cn"

export default function DashboardPage() {
    const supabase = createClient()
    const [stats, setStats] = useState<any[]>([])
    const [recentJobs, setRecentJobs] = useState<any[]>([])
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        fetchDashboardData()

        // Poll for job updates every 5 seconds to show progress
        const interval = setInterval(fetchRecentJobs, 5000)
        return () => clearInterval(interval)
    }, [])

    const fetchDashboardData = async () => {
        setIsLoading(true)
        try {
            const { data: { user } } = await supabase.auth.getUser()
            if (!user) return

            // Fetch Total Blogs
            const { count: blogCount } = await supabase
                .from("blogs")
                .select("*", { count: "exact", head: true })

            // Fetch Total Articles
            const { count: articleCount } = await supabase
                .from("articles")
                .select("*", { count: "exact", head: true })

            // Fetch Total Jobs (to show activity)
            const { count: jobCount } = await supabase
                .from("job_queue")
                .select("*", { count: "exact", head: true })

            setStats([
                { name: "Total Blogs", value: blogCount || 0, icon: Globe, change: "Manage All", color: "text-blue-500", bg: "bg-blue-500/10", href: "/dashboard/blogs" },
                { name: "Articles Stored", value: articleCount || 0, icon: FileText, change: "Crawl Results", color: "text-indigo-500", bg: "bg-indigo-500/10", href: "/dashboard/articles" },
                { name: "Active Clusters", value: "0", icon: Zap, change: "Generate New", color: "text-amber-500", bg: "bg-amber-500/10", href: "/dashboard/clusters" },
                { name: "Sync Jobs", value: jobCount || 0, icon: TrendingUp, change: "Queue Volume", color: "text-emerald-500", bg: "bg-emerald-500/10", href: "/dashboard/blogs" },
            ])

            await fetchRecentJobs()
        } catch (err) {
            console.error("Dashboard error:", err)
        } finally {
            setIsLoading(false)
        }
    }

    const fetchRecentJobs = async () => {
        const { data: jobs } = await supabase
            .from("job_queue")
            .select("*")
            .order("created_at", { ascending: false })
            .limit(5)

        setRecentJobs(jobs || [])
    }

    if (isLoading) {
        return (
            <div className="flex h-[80vh] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Dashboard Overview</h1>
                <p className="text-muted-foreground mt-1">Real-time stats from your connected WordPress sites.</p>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {stats.map((stat) => (
                    <div key={stat.name} className="group relative overflow-hidden rounded-2xl border bg-card p-6 transition-all hover:shadow-2xl hover:shadow-primary/5">
                        <div className="flex items-center justify-between">
                            <div className={cn("rounded-xl p-2.5", stat.bg)}>
                                <stat.icon className={cn("h-6 w-6", stat.color)} />
                            </div>
                            <a href={stat.href} className="rounded-full p-2 hover:bg-accent transition-colors">
                                <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                            </a>
                        </div>
                        <div className="mt-4">
                            <h3 className="text-sm font-medium text-muted-foreground">{stat.name}</h3>
                            <p className="text-2xl font-bold mt-1 tracking-tight">{stat.value}</p>
                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                <span className="text-emerald-500 font-medium">✨</span> {stat.change}
                            </p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-7">
                <div className="lg:col-span-4 rounded-2xl border bg-card/50 p-6 backdrop-blur-sm">
                    <h3 className="text-lg font-semibold mb-4">Content Growth</h3>
                    <div className="h-[300px] flex items-end justify-between gap-2 px-2">
                        {[40, 70, 45, 90, 65, 80, 55, 95, 75, 60, 85, 50].map((height, i) => (
                            <div key={i} className="flex-1 group relative">
                                <div
                                    className="w-full bg-primary/20 rounded-t-lg transition-all duration-500 group-hover:bg-primary"
                                    style={{ height: `${height}%` }}
                                />
                            </div>
                        ))}
                    </div>
                    <div className="flex justify-between mt-4 text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">
                        <span>Jan</span>
                        <span>Mar</span>
                        <span>May</span>
                        <span>Jul</span>
                        <span>Sep</span>
                        <span>Nov</span>
                    </div>
                </div>

                <div className="lg:col-span-3 rounded-2xl border bg-card/50 p-6 backdrop-blur-sm">
                    <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
                        Live Queue
                        <span className="relative flex h-2 w-2">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
                        </span>
                    </h3>
                    <div className="space-y-4">
                        {recentJobs.map((job, i) => (
                            <div key={i} className="border-b last:border-0 pb-4 last:pb-0">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="text-sm font-medium line-clamp-1">
                                        {job.type === 'crawl' ? 'Crawling WordPress Blog' : 'Semantic Clustering'}
                                    </span>
                                    <span className={cn(
                                        "text-[10px] font-bold px-1.5 py-0.5 rounded uppercase tracking-widest leading-none flex items-center h-4",
                                        job.status === 'completed' ? 'bg-emerald-500/10 text-emerald-500' :
                                            job.status === 'failed' ? 'bg-destructive/10 text-destructive' :
                                                'bg-primary/10 text-primary'
                                    )}>
                                        {job.status}
                                    </span>
                                </div>
                                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                                    <span>Started {new Date(job.created_at).toLocaleTimeString()}</span>
                                    {job.status === 'processing' && <Loader2 className="h-3 w-3 animate-spin text-primary" />}
                                </div>
                            </div>
                        ))}

                        {recentJobs.length === 0 && (
                            <div className="flex flex-col items-center justify-center py-12 text-center">
                                <TrendingUp className="h-8 w-8 mb-2 opacity-20" />
                                <p className="text-xs text-muted-foreground">No active jobs in queue</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
