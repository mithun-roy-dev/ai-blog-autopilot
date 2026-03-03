"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Globe, Mail, Lock, Loader2, Github, AlertCircle } from "lucide-react"
import { createClient } from "@/utils/supabase/client"
import { cn } from "@/utils/cn"

export const dynamic = "force-dynamic"

export default function LoginPage() {
    const router = useRouter()
    const supabase = createClient()

    const [email, setEmail] = useState("")
    const [password, setPassword] = useState("")
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [isSignUp, setIsSignUp] = useState(false)

    const handleAuth = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)
        setError(null)

        try {
            if (isSignUp) {
                const { error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: {
                        emailRedirectTo: `${window.location.origin}/auth/callback`,
                    },
                })
                if (error) throw error
                setError("Check your email for the confirmation link!")
            } else {
                const { error } = await supabase.auth.signInWithPassword({
                    email,
                    password,
                })
                if (error) throw error
                router.push("/dashboard")
                router.refresh()
            }
        } catch (err: any) {
            setError(err.message || "An authentication error occurred")
        } finally {
            setIsLoading(false)
        }
    }

    const handleOAuth = async (provider: 'github') => {
        await supabase.auth.signInWithOAuth({
            provider,
            options: {
                redirectTo: `${window.location.origin}/auth/callback`,
            },
        })
    }

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
            <div className="absolute inset-0 -z-10 bg-[radial-gradient(45%_45%_at_50%_50%,rgba(99,102,241,0.05)_0%,transparent_100%)]" />

            <div className="w-full max-w-md space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
                <div className="flex flex-col items-center text-center">
                    <Link href="/" className="group mb-6 flex items-center gap-2 transition-transform hover:scale-105">
                        <div className="h-10 w-10 rounded-xl bg-primary flex items-center justify-center shadow-lg shadow-primary/20">
                            <Globe className="h-6 w-6 text-primary-foreground" />
                        </div>
                        <span className="text-2xl font-bold tracking-tight">Autopilot</span>
                    </Link>
                    <h2 className="text-3xl font-bold tracking-tight">
                        {isSignUp ? "Create your account" : "Welcome back"}
                    </h2>
                    <p className="mt-2 text-muted-foreground">
                        {isSignUp ? "Start your 14-day free trial today." : "Sign in to manage your autopilot."}
                    </p>
                </div>

                <div className="rounded-2xl border bg-card/50 p-8 shadow-2xl backdrop-blur-xl">
                    <form onSubmit={handleAuth} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70" htmlFor="email">
                                Email Address
                            </label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <input
                                    id="email"
                                    type="email"
                                    placeholder="name@example.com"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="flex h-11 w-full rounded-xl border bg-background/50 pl-10 pr-4 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/20"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <label className="text-sm font-medium leading-none" htmlFor="password">
                                    Password
                                </label>
                                {!isSignUp && (
                                    <Link href="#" className="text-xs text-primary hover:underline">
                                        Forgot password?
                                    </Link>
                                )}
                            </div>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                                <input
                                    id="password"
                                    type="password"
                                    placeholder="••••••••"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="flex h-11 w-full rounded-xl border bg-background/50 pl-10 pr-4 text-sm transition-all focus:outline-none focus:ring-2 focus:ring-primary/20"
                                />
                            </div>
                        </div>

                        {error && (
                            <div className={cn(
                                "flex items-center gap-2 rounded-lg p-3 text-sm animate-in fade-in zoom-in duration-300",
                                isSignUp && !error.includes("failed") ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" : "bg-destructive/10 text-destructive border border-destructive/20"
                            )}>
                                <AlertCircle className="h-4 w-4" />
                                <span>{error}</span>
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="flex h-11 w-full items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100"
                        >
                            {isLoading ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                            ) : (
                                isSignUp ? "Sign Up" : "Sign In"
                            )}
                        </button>
                    </form>

                    <div className="relative my-8">
                        <div className="absolute inset-0 flex items-center">
                            <span className="w-full border-t" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                            <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                        <button
                            onClick={() => handleOAuth('github')}
                            className="flex h-11 items-center justify-center gap-3 rounded-xl border bg-background px-8 text-sm font-medium transition-all hover:bg-accent"
                        >
                            <Github className="h-5 w-5" />
                            GitHub
                        </button>
                    </div>
                </div>

                <p className="text-center text-sm text-muted-foreground">
                    {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
                    <button
                        onClick={() => setIsSignUp(!isSignUp)}
                        className="font-semibold text-primary hover:underline"
                    >
                        {isSignUp ? "Sign in" : "Sign up for free"}
                    </button>
                </p>
            </div>
        </div>
    )
}
