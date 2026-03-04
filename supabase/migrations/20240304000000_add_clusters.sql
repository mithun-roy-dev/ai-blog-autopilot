-- Migration: Add Content Clusters and Cluster Pages
-- Date: 2026-03-04

-- Create content_clusters table
CREATE TABLE IF NOT EXISTS public.content_clusters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blog_id UUID NOT NULL REFERENCES public.blogs(id) ON DELETE CASCADE,
  topic TEXT NOT NULL,
  intent TEXT,
  strategy_summary TEXT,
  status TEXT DEFAULT 'completed', -- queued, processing, completed
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Enable RLS on content_clusters
ALTER TABLE public.content_clusters ENABLE ROW LEVEL SECURITY;

-- Create cluster_pages table
CREATE TABLE IF NOT EXISTS public.cluster_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_id UUID NOT NULL REFERENCES public.content_clusters(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  type TEXT DEFAULT 'supporting', -- pillar, supporting
  status TEXT DEFAULT 'not_generated', -- not_generated, generated, published
  word_count_target INTEGER DEFAULT 1000,
  article_id UUID REFERENCES public.articles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Enable RLS on cluster_pages
ALTER TABLE public.cluster_pages ENABLE ROW LEVEL SECURITY;

-- RLS POLICIES --

-- Content Clusters: Users can manage their own clusters
CREATE POLICY "Users can manage own clusters" ON public.content_clusters
  FOR ALL USING (auth.uid() = user_id);

-- Cluster Pages: Users can manage pages via their clusters
CREATE POLICY "Users can manage own cluster pages" ON public.cluster_pages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.content_clusters
      WHERE id = cluster_pages.cluster_id
      AND user_id = auth.uid()
    )
  );
