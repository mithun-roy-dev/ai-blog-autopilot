ALTER TABLE public.ai_configurations ADD COLUMN IF NOT EXISTS seo_schema_model TEXT;
ALTER TABLE public.blog_publishing_settings ADD COLUMN IF NOT EXISTS enable_seo_schema_generation BOOLEAN DEFAULT FALSE;
