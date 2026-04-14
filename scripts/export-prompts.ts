/**
 * scripts/export-prompts.ts
 *
 * Exports all prompts from the `ai_prompts` Supabase table to individual
 * JSON files under /prompts/<slug>.json so they can be version-controlled in git.
 *
 * Usage:
 *   npx tsx scripts/export-prompts.ts
 *   (or: npm run prompts:export)
 */

import * as fs from 'fs';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load .env.local (frontend) and worker/.env (has service role key)
dotenv.config({ path: path.resolve(__dirname, '../.env.local') });
dotenv.config({ path: path.resolve(__dirname, '../worker/.env') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_KEY =
    process.env.SUPABASE_SERVICE_ROLE_KEY          // preferred: full access
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;  // fallback: anon key (sufficient for reading published prompts)

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const PROMPTS_DIR = path.resolve(__dirname, '../prompts');

async function main() {
    console.log('📥 Fetching prompts from Supabase...');

    const { data: prompts, error } = await supabase
        .from('ai_prompts')
        .select('slug, name, system_prompt, user_prompt_template, variables, is_published')
        .order('slug');
    if (error) {
        console.error('❌ Failed to fetch prompts:', error.message);
        process.exit(1);
    }

    if (!prompts || prompts.length === 0) {
        console.warn('⚠️  No prompts found in ai_prompts table.');
        return;
    }

    // Ensure /prompts directory exists
    if (!fs.existsSync(PROMPTS_DIR)) {
        fs.mkdirSync(PROMPTS_DIR, { recursive: true });
        console.log(`📁 Created directory: prompts/`);
    }

    for (const prompt of prompts) {
        const filePath = path.join(PROMPTS_DIR, `${prompt.slug}.json`);
        const content = JSON.stringify(prompt, null, 2);
        fs.writeFileSync(filePath, content, 'utf-8');
        console.log(`  ✅ prompts/${prompt.slug}.json`);
    }

    console.log(`\n✅ Exported ${prompts.length} prompt(s) to /prompts/`);
    console.log('👉 Now run: git add prompts/ && git commit -m "chore: update prompts"');
}

main();
