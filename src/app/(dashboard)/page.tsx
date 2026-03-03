import { FileText, Globe, Zap, ArrowUpRight, TrendingUp } from "lucide-react"
import { cn } from "@/utils/cn"

const stats = [
    { name: "Total Blogs", value: "12", icon: Globe, change: "+2 this month", color: "text-blue-500", bg: "bg-blue-500/10" },
    { name: "Articles Generated", value: "458", icon: FileText, change: "+85 last week", color: "text-indigo-500", bg: "bg-indigo-500/10" },
    { name: "SEO Optimization", value: "92%", icon: Zap, change: "Avg. score", color: "text-amber-500", bg: "bg-amber-500/10" },
    { name: "Token Usage", value: "1.2M", icon: TrendingUp, change: "42% of limit", color: "text-emerald-500", bg: "bg-emerald-500/10" },
]

export default function DashboardPage() {
    return (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Dashboard Overview</h1>
                <p className="text-muted-foreground mt-1">Welcome back! Here's what's happening with your autopilot.</p>
            </div>

            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                {stats.map((stat) => (
                    <div key={stat.name} className="group relative overflow-hidden rounded-2xl border bg-card p-6 transition-all hover:shadow-2xl hover:shadow-primary/5">
                        <div className="flex items-center justify-between">
                            <div className={cn("rounded-xl p-2.5", stat.bg)}>
                                <stat.icon className={cn("h-6 w-6", stat.color)} />
                            </div>
                            <button className="rounded-full p-2 hover:bg-accent transition-colors">
                                <ArrowUpRight className="h-4 w-4 text-muted-foreground" />
                            </button>
                        </div>
                        <div className="mt-4">
                            <h3 className="text-sm font-medium text-muted-foreground">{stat.name}</h3>
                            <p className="text-2xl font-bold mt-1">{stat.value}</p>
                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                                <span className="text-emerald-500 font-medium">{stat.change.split(' ')[0]}</span>
                                {stat.change.split(' ').slice(1).join(' ')}
                            </p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-7">
                <div className="lg:col-span-4 rounded-2xl border bg-card/50 p-6 backdrop-blur-sm">
                    <h3 className="text-lg font-semibold mb-4">Generation Activity</h3>
                    <div className="h-[300px] flex items-end justify-between gap-2 px-2">
                        {[40, 70, 45, 90, 65, 80, 55, 95, 75, 60, 85, 50].map((height, i) => (
                            <div key={i} className="flex-1 group relative">
                                <div
                                    className="w-full bg-primary/20 rounded-t-lg transition-all duration-500 group-hover:bg-primary"
                                    style={{ height: `${height}%` }}
                                />
                                <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-popover border px-2 py-1 rounded text-[10px] opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                                    {height} articles
                                </div>
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
                    <h3 className="text-lg font-semibold mb-4">Live Queue</h3>
                    <div className="space-y-4">
                        {[
                            { title: "The Future of AI in SEO", status: "Generating", progress: 65 },
                            { title: "Building SaaS with Next.js", status: "Clustering", progress: 30 },
                            { title: "WordPress API Tips", status: "Queued", progress: 0 },
                        ].map((item, i) => (
                            <div key={i} className="border-b last:border-0 pb-4 last:pb-0">
                                <div className="flex justify-between items-start mb-2">
                                    <span className="text-sm font-medium line-clamp-1">{item.title}</span>
                                    <span className="text-[10px] font-bold bg-accent px-1.5 py-0.5 rounded text-accent-foreground uppercase tracking-widest leading-none flex items-center h-4">{item.status}</span>
                                </div>
                                {item.progress > 0 && (
                                    <div className="h-1.5 w-full bg-accent rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-primary transition-all duration-1000"
                                            style={{ width: `${item.progress}%` }}
                                        />
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )
}
