ALTER TABLE public.ai_configurations
ADD COLUMN IF NOT EXISTS image_metadata_model TEXT DEFAULT 'mistralai/mistral-nemo';
