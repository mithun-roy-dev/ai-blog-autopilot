-- Migration: SEO Schema Generation support
-- Adds seo_schema_model to ai_configurations.
-- blog_publishing_settings already has enable_seo_schema_generation — drop the redundant enable_seo_schema column if it was added by mistake.

-- 1. Add seo_schema_model column to ai_configurations
ALTER TABLE ai_configurations
    ADD COLUMN IF NOT EXISTS seo_schema_model TEXT DEFAULT 'claude-haiku-4-5';

-- 2. Drop the redundant column added by a previous migration run (if it exists)
ALTER TABLE blog_publishing_settings
    DROP COLUMN IF EXISTS enable_seo_schema;

-- NOTE: blog_publishing_settings already has enable_seo_schema_generation (BOOLEAN).
-- That is the canonical column used by publisher.service.ts and site-setup UI.
