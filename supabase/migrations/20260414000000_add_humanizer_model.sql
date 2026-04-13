-- Add humanizer_model column to ai_configurations table
ALTER TABLE public.ai_configurations
    ADD COLUMN IF NOT EXISTS humanizer_model TEXT;
