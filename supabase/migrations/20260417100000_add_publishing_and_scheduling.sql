-- 1. Add missing wp_username column to blogs
ALTER TABLE public.blogs ADD COLUMN IF NOT EXISTS wp_username TEXT;

-- 2. Create blog_publishing_settings table
CREATE TABLE IF NOT EXISTS public.blog_publishing_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blog_id UUID NOT NULL REFERENCES public.blogs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    
    -- Publishing Rules
    auto_publish BOOLEAN DEFAULT FALSE,
    publish_save_status TEXT DEFAULT 'draft', -- draft, scheduled, published
    
    -- Scheduling Rules
    schedule_active BOOLEAN DEFAULT FALSE,
    frequency TEXT DEFAULT 'daily', -- daily, weekly, monthly
    times_per_period INTEGER DEFAULT 1,
    schedule_logic TEXT DEFAULT 'spread_evenly', -- spread_evenly, all_at_once
    start_time TIME DEFAULT '09:00:00',
    next_run_at TIMESTAMP WITH TIME ZONE,
    
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()),
    UNIQUE(blog_id)
);

-- 3. Enable RLS
ALTER TABLE public.blog_publishing_settings ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policy (Idempotent: Drop if exists then create)
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can manage own publishing settings' AND tablename = 'blog_publishing_settings') THEN
        DROP POLICY "Users can manage own publishing settings" ON public.blog_publishing_settings;
    END IF;
END $$;

CREATE POLICY "Users can manage own publishing settings" ON public.blog_publishing_settings
  FOR ALL USING (auth.uid() = user_id);

-- 5. RPC Function for Scheduler (Idempotent: CREATE OR REPLACE)
CREATE OR REPLACE FUNCTION get_next_cluster_page_for_blog(p_blog_id UUID)
RETURNS TABLE (
    id UUID,
    cluster_id UUID,
    title TEXT,
    slug TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT cp.id, cp.cluster_id, cp.title, cp.slug
    FROM cluster_pages cp
    JOIN content_clusters cc ON cc.id = cp.cluster_id
    WHERE cc.blog_id = p_blog_id
    AND cp.status = 'not_generated'
    ORDER BY cp.created_at ASC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
