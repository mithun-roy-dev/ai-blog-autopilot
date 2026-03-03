"use client"

import { Search, Bell, User } from "lucide-react"

export function Header() {
    return (
        <header className="flex h-16 items-center justify-between border-b bg-card/50 px-8 backdrop-blur-xl sticky top-0 z-40">
            <div className="relative w-96">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                    type="text"
                    placeholder="Search articles, blogs..."
                    className="h-10 w-full rounded-full border bg-background/50 pl-10 pr-4 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
            </div>

            <div className="flex items-center gap-4">
                <button className="relative rounded-full p-2 hover:bg-accent transition-colors">
                    <Bell className="h-5 w-5 text-muted-foreground" />
                    <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-primary border-2 border-card" />
                </button>
                <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-primary to-violet-400 flex items-center justify-center">
                    <User className="h-4 w-4 text-white" />
                </div>
            </div>
        </header>
    )
}
