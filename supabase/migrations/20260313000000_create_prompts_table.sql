-- Create AI Prompts Table
CREATE TABLE IF NOT EXISTS public.ai_prompts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    system_prompt TEXT,
    user_prompt_template TEXT,
    variables JSONB DEFAULT '[]'::jsonb,
    version INT DEFAULT 1,
    is_published BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_prompts ENABLE ROW LEVEL SECURITY;

-- Allow Super Admin access (mithunroyabir@gmail.com)
CREATE POLICY "Super Admin CRUD" ON public.ai_prompts
FOR ALL
TO authenticated
USING (auth.jwt() ->> 'email' = 'mithunroyabir@gmail.com')
WITH CHECK (auth.jwt() ->> 'email' = 'mithunroyabir@gmail.com');

-- Grant access to service role (for worker)
GRANT ALL ON public.ai_prompts TO service_role;
