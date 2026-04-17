-- Add internal_url column to articles table
ALTER TABLE articles ADD COLUMN IF NOT EXISTS internal_url TEXT;
