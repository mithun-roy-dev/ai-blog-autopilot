import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs/promises';
import * as path from 'path';

// This runs on the server.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
// Fallback to anon key if service role key isn't provided (e.g., during build time)
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''; 
const supabase = createClient(supabaseUrl, supabaseKey);

// Define log paths
const LOGS_DIR = path.join(process.cwd(), 'logs');
const ERROR_LOG = path.join(LOGS_DIR, 'error_log.txt');
const DEBUG_LOG = path.join(LOGS_DIR, 'debug_log.txt');

// Simple in-memory cache to prevent spamming DB for every log request
let cachedSettings: { enable_debug: boolean; enable_error: boolean } | null = null;
let lastCacheTime = 0;
const CACHE_TTL_MS = 60 * 1000; // 1 minute

async function getLoggingConfig() {
    const now = Date.now();
    if (cachedSettings && now - lastCacheTime < CACHE_TTL_MS) {
        return cachedSettings;
    }

    try {
        const { data, error } = await supabase
            .from('system_settings')
            .select('value')
            .eq('key', 'logging_config')
            .single();

        if (error) throw error;

        cachedSettings = data?.value || { enable_debug: true, enable_error: true };
        lastCacheTime = now;
        return cachedSettings;
    } catch (err) {
        console.error("Failed to fetch logging config, defaulting to true", err);
        return { enable_debug: true, enable_error: true };
    }
}

async function ensureLogDir() {
    try {
        await fs.access(LOGS_DIR);
    } catch {
        await fs.mkdir(LOGS_DIR, { recursive: true });
    }
}

function formatLogLine(level: string, context: string, message: string, extra?: any): string {
    const ts = new Date().toISOString();
    let line = `[${ts}] [${level}] [${context}] ${message}`;
    if (extra !== undefined) {
        try {
            line += ' | ' + (typeof extra === 'string' ? extra : JSON.stringify(extra));
        } catch {
            line += ' | [Unserializable data]';
        }
    }
    return line + '\n';
}

export async function POST(req: Request) {
    try {
        const body = await req.json();
        const { level = 'INFO', context = 'Unknown', message = '', extra } = body;

        const config = await getLoggingConfig();
        const logLine = formatLogLine(level, context, message, extra);

        await ensureLogDir();

        // Always write ERROR and WARN to error_log.txt if enable_error is true
        if (config?.enable_error && (level === 'ERROR' || level === 'WARN')) {
            await fs.appendFile(ERROR_LOG, logLine, 'utf8');
        }

        // Always write EVERYTHING to debug_log.txt if enable_debug is true (including errors)
        if (config?.enable_debug) {
            await fs.appendFile(DEBUG_LOG, logLine, 'utf8');
        }

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Critical: Logging API failed", error);
        return NextResponse.json({ error: 'Failed to process log' }, { status: 500 });
    }
}
