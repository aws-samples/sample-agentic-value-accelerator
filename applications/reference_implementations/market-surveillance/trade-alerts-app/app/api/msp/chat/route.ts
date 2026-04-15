import { NextRequest } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/msp/chat
 * Streams responses from AgentCore Runtime for Risk Analyst domain
 */
export async function POST(req: NextRequest) {
    try {
        const authHeader = req.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const accessToken = authHeader.substring(7);
        const requestBody = await req.json();
        const { message, sessionId, userId } = requestBody;

        if (!message || typeof message !== 'string') {
            return new Response(JSON.stringify({ error: 'Message is required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        let finalUserId = userId || 'anonymous';
        if (!userId) {
            try {
                const payloadBase64 = accessToken.split('.')[1];
                const payloadJson = Buffer.from(payloadBase64, 'base64').toString('utf-8');
                const payload = JSON.parse(payloadJson);
                finalUserId = payload.sub || payload.username || payload['cognito:username'] || 'anonymous';
            } catch (e) {
                console.warn('Failed to extract user ID from JWT:', e);
            }
        }

        const agentCoreUrl = process.env.RISK_AGENTCORE_ENDPOINT;
        if (!agentCoreUrl) {
            return new Response(JSON.stringify({ error: 'Service unavailable - RISK_AGENTCORE_ENDPOINT not configured' }), {
                status: 503,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const agentPayload = {
            prompt: message,
            session_id: sessionId,
            user_id: finalUserId,
        };

        let agentResponse;
        try {
            agentResponse = await fetch(agentCoreUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    'Connection': 'keep-alive',
                },
                body: JSON.stringify(agentPayload),
                signal: undefined,
            });
        } catch (fetchError) {
            console.error('Failed to connect to AgentCore:', fetchError);
            return new Response(
                JSON.stringify({
                    error: 'Failed to connect to AgentCore Runtime',
                    details: fetchError instanceof Error ? fetchError.message : 'Unknown error'
                }),
                { status: 502, headers: { 'Content-Type': 'application/json' } }
            );
        }

        if (!agentResponse.ok) {
            const errorText = await agentResponse.text().catch(() => 'Unknown error');
            console.error('AgentCore error:', agentResponse.status, errorText);
            return new Response(
                JSON.stringify({ error: 'Failed to get response from agent', status: agentResponse.status, details: errorText }),
                { status: 502, headers: { 'Content-Type': 'application/json' } }
            );
        }

        if (!agentResponse.body) {
            return new Response(
                JSON.stringify({ error: 'No response body from agent' }),
                { status: 502, headers: { 'Content-Type': 'application/json' } }
            );
        }

        const encoder = new TextEncoder();
        const decoder = new TextDecoder();

        const stream = new ReadableStream({
            async start(controller) {
                try {
                    const reader = agentResponse.body!.getReader();
                    let buffer = '';

                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) {
                            if (buffer.trim()) {
                                const event = parseEvent(buffer);
                                if (event) {
                                    const transformed = transformAgentEvent(event);
                                    if (transformed) controller.enqueue(encoder.encode(JSON.stringify(transformed) + '\n'));
                                }
                            }
                            break;
                        }

                        buffer += decoder.decode(value, { stream: true });
                        const lines = buffer.split('\n');
                        buffer = lines.pop() || '';

                        for (const line of lines) {
                            if (line.trim()) {
                                const event = parseEvent(line);
                                if (event) {
                                    const transformed = transformAgentEvent(event);
                                    if (transformed) controller.enqueue(encoder.encode(JSON.stringify(transformed) + '\n'));
                                }
                            }
                        }
                    }
                    controller.close();
                } catch (error) {
                    console.error('Risk Analyst streaming error:', error);
                    controller.error(error);
                }
            },
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Cache-Control': 'no-cache, no-transform',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no',
                'Transfer-Encoding': 'chunked',
            },
        });
    } catch (error) {
        console.error('Risk Analyst Agent API error:', error);
        return new Response(
            JSON.stringify({ error: 'Internal server error', message: error instanceof Error ? error.message : 'Unknown error' }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
}

function parseEvent(line: string): any | null {
    const trimmed = line.trim();
    if (!trimmed) return null;
    if (trimmed.startsWith('data: ')) {
        try { return JSON.parse(trimmed.substring(6)); } catch { return null; }
    }
    try { return JSON.parse(trimmed); } catch { return null; }
}

function transformAgentEvent(event: any): any {
    if (event.status === 'error' || event.error) {
        return { type: 'error', data: event.error || event.message || 'Unknown error occurred' };
    }
    if (event.type === 'content_delta') return { type: 'text', data: event.data || '' };
    if (event.type === 'thinking') return { type: 'thinking', data: event.data };
    if (event.type === 'trace') return { type: 'trace', data: event.data };
    if (event.type === 'image') return { type: 'image', base64: event.base64, alt: event.alt || 'Chart' };
    if (event.type === 'result') return { type: 'complete', data: event.data || 'Completed' };
    return null;
}
