-- Add max_article_tags column to blog_publishing_settings
ALTER TABLE public.blog_publishing_settings ADD COLUMN IF NOT EXISTS max_article_tags INTEGER DEFAULT 0;
