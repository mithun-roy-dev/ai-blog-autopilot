import Link from "next/link";
import { Globe, ArrowRight } from "lucide-react";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-24 text-center">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(45%_45%_at_50%_50%,rgba(99,102,241,0.08)_0%,transparent_100%)]" />

      <div className="inline-flex items-center gap-2 rounded-full border bg-card/50 px-4 py-1.5 text-sm font-medium backdrop-blur-sm animate-in fade-in slide-in-from-top-4 duration-1000">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75"></span>
          <span className="relative inline-flex h-2 w-2 rounded-full bg-primary"></span>
        </span>
        <span className="text-muted-foreground">Phase 1 MVP Live</span>
      </div>

      <h1 className="mt-8 max-w-3xl text-5xl font-bold tracking-tight sm:text-7xl animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-150">
        Scale your content with <span className="text-primary italic">Autopilot</span>
      </h1>

      <p className="mt-6 max-w-xl text-lg text-muted-foreground animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-300">
        The all-in-one AI platform to crawl, cluster, and generate SEO-optimized articles for your WordPress blogs.
      </p>

      <div className="mt-10 flex flex-wrap items-center justify-center gap-4 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-500">
        <Link
          href="/login"
          className="group relative flex h-12 items-center justify-center gap-2 rounded-full bg-primary px-8 text-sm font-semibold text-primary-foreground transition-all hover:scale-105 active:scale-95 shadow-xl shadow-primary/20"
        >
          Get Started
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Link>
        <Link
          href="/dashboard"
          className="flex h-12 items-center justify-center px-8 text-sm font-semibold hover:text-primary transition-colors"
        >
          View Demo
        </Link>
      </div>

      <div className="mt-24 grid grid-cols-1 gap-8 sm:grid-cols-3 animate-in fade-in slide-in-from-bottom-4 duration-1000 delay-700">
        {[
          { title: "Crawl & Store", desc: "Instantly index your existing WordPress content." },
          { title: "Smart Clustering", desc: "Identify topical gaps and content opportunities." },
          { title: "AI Generation", desc: "Generate SEO-optimized articles in clicks." },
        ].map((feature, i) => (
          <div key={i} className="rounded-2xl border bg-card/50 p-6 backdrop-blur-sm text-left">
            <h3 className="font-semibold">{feature.title}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{feature.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
