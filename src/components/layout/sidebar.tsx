"use client"

import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { LayoutDashboard, FileText, Settings, Globe, LogOut, User, Shield } from "lucide-react"
import { cn } from "@/utils/cn"
import { createClient } from "@/utils/supabase/client"
import { useEffect, useState } from "react"

const navigation = [
    { name: "Overview", href: "/dashboard", icon: LayoutDashboard },
    { name: "Sites", href: "/dashboard/blogs", icon: Globe },
    { name: "Clusters", href: "/dashboard/clusters", icon: FileText }, // Semantic agrupation
    { name: "Articles", href: "/dashboard/articles", icon: FileText },
    { name: "Settings", href: "/dashboard/settings", icon: Settings },
]

export function Sidebar() {
    const pathname = usePathname()
    const router = useRouter()
    const supabase = createClient()
    const [user, setUser] = useState<any>(null)

    useEffect(() => {
        const getUser = async () => {
            const { data: { user } } = await supabase.auth.getUser()
            setUser(user)
        }
        getUser()
    }, [supabase])

    const handleSignOut = async () => {
        await supabase.auth.signOut()
        router.push("/login")
        router.refresh()
    }

    return (
        <div className="flex h-full w-64 flex-col border-r bg-card/50 backdrop-blur-xl">
            <div className="flex h-16 items-center px-6">
                <Link href="/dashboard" className="flex items-center gap-2">
                    <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
                        <Globe className="h-5 w-5 text-primary-foreground" />
                    </div>
                    <span className="text-xl font-bold tracking-tight">Autopilot</span>
                </Link>
            </div>

            <nav className="flex-1 space-y-1 px-4 py-4 overflow-y-auto">
                {navigation.map((item) => {
                    const isActive = pathname === item.href
                    return (
                        <Link
                            key={item.name}
                            href={item.href}
                            className={cn(
                                "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                                isActive
                                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                            )}
                        >
                            <item.icon className={cn("h-4 w-4", isActive ? "text-primary-foreground" : "text-muted-foreground group-hover:text-accent-foreground")} />
                            {item.name}
                        </Link>
                    )
                })}

                {/* Super Admin Section */}
                {user?.email === "mithunroyabir@gmail.com" && (
                    <div className="pt-4 mt-4 border-t border-border">
                        <div className="px-3 mb-2">
                            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest pl-1">Admin Only</span>
                        </div>
                        <Link
                            href="/dashboard/admin/site-setup"
                            className={cn(
                                "group flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200",
                                pathname === "/dashboard/admin/site-setup"
                                    ? "bg-orange-500 text-white shadow-lg shadow-orange-500/20"
                                    : "text-muted-foreground hover:bg-orange-500/10 hover:text-orange-600"
                            )}
                        >
                            <Shield className={cn("h-4 w-4", pathname === "/dashboard/admin/site-setup" ? "text-white" : "text-orange-500")} />
                            Site Setup
                        </Link>
                    </div>
                )}
            </nav>

            <div className="border-t p-4 space-y-4">
                {user && (
                    <div className="flex items-center gap-3 px-3 py-2">
                        <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-primary to-violet-400 flex items-center justify-center border border-white/10 shadow-lg shadow-primary/20">
                            <User className="h-4 w-4 text-white" />
                        </div>
                        <div className="flex flex-col overflow-hidden">
                            <span className="text-xs font-semibold truncate">{user.email?.split('@')[0]}</span>
                            <span className="text-[10px] text-muted-foreground truncate">{user.email}</span>
                        </div>
                    </div>
                )}
                <button
                    onClick={handleSignOut}
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive group"
                >
                    <LogOut className="h-4 w-4 transition-transform group-hover:-translate-x-1" />
                    Sign Out
                </button>
            </div>
        </div>
    )
}
