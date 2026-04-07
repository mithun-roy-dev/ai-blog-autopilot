-- Phase 1: Drop old unused model columns from ai_configurations
ALTER TABLE ai_configurations
    DROP COLUMN IF EXISTS default_model,
    DROP COLUMN IF EXISTS thinking_model_1,
    DROP COLUMN IF EXISTS thinking_model_2,
    DROP COLUMN IF EXISTS fast_model_1,
    DROP COLUMN IF EXISTS fast_model_2,
    DROP COLUMN IF EXISTS image_model_1,
    DROP COLUMN IF EXISTS image_model_2,
    DROP COLUMN IF EXISTS free_model_1,
    DROP COLUMN IF EXISTS free_model_2;

-- Phase 2: Add new explicit task-specific model columns
-- writer_model and image_metadata_model already exist, skip those
ALTER TABLE ai_configurations
    ADD COLUMN IF NOT EXISTS content_brief_model text NULL,
    ADD COLUMN IF NOT EXISTS feature_image_model text NULL,
    ADD COLUMN IF NOT EXISTS inbody_image_model text NULL;
