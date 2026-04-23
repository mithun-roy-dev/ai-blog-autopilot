import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * POST /api/prompts/cache-bust
 *
 * Called by site-setup after a prompt is saved. Notifies the worker to evict
 * that prompt slug from its in-memory PromptService cache, so the next
 * publish job fetches the freshest prompt from DB without waiting for TTL.
 *
 * Body (optional): { slug: string }
 * If slug is omitted → full cache clear.
 */
export async function POST(req: NextRequest) {
    try {
        // Auth guard — only authenticated admin users
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json().catch(() => ({}));
        const slug: string | undefined = body?.slug;

        // Notify the worker via its internal HTTP endpoint
        const workerUrl = process.env.WORKER_INTERNAL_URL;
        if (workerUrl) {
            try {
                await fetch(`${workerUrl}/internal/cache-bust/prompts`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-internal-secret': process.env.WORKER_INTERNAL_SECRET || '',
                    },
                    body: JSON.stringify({ slug }),
                    signal: AbortSignal.timeout(3000), // 3 s — fire-and-forget style
                });
            } catch (workerErr: any) {
                // Non-fatal: worker may be down or restarting. TTL will handle it.
                console.warn('[cache-bust] Worker notification failed (non-fatal):', workerErr.message);
            }
        }

        return NextResponse.json({
            ok: true,
            message: slug
                ? `Cache bust sent for prompt slug: "${slug}"`
                : 'Full prompt cache bust sent',
        });
    } catch (err: any) {
        console.error('[cache-bust] Error:', err.message);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
