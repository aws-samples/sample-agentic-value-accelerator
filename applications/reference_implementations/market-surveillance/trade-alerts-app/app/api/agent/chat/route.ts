import { NextRequest } from 'next/server';

// Configure route segment for streaming with extended timeout
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // 5 minutes for long-running agent requests

/**
 * POST /api/agent/chat
 * Streams responses directly from AgentCore Runtime with token-level streaming
 */
export async function POST(req: NextRequest) {
    try {
        // Get authorization header (should contain access token from Cognito)
        const authHeader = req.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            console.error('Missing or invalid authorization header');
            return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Extract access token from Bearer header
        const accessToken = authHeader.substring(7);

        // Get request body
        const requestBody = await req.json();
        const { message, sessionId, alertId, userId } = requestBody;

        if (!message || typeof message !== 'string') {
            return new Response(JSON.stringify({ error: 'Message is required' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Use userId from request body, or extract from JWT as fallback
        let finalUserId = userId || 'anonymous';
        if (!userId) {
            try {
                const payloadBase64 = accessToken.split('.')[1];
                const payloadJson = Buffer.from(payloadBase64, 'base64').toString('utf-8');
                const payload = JSON.parse(payloadJson);
                finalUserId = payload.sub || payload.username || payload['cognito:username'] || 'anonymous';
            } catch (e) {
                console.warn('Failed to extract user ID from JWT, using anonymous:', e);
            }
        }

        // Get AgentCore endpoint from environment
        const agentCoreUrl = process.env.AGENTCORE_ENDPOINT;
        if (!agentCoreUrl) {
            console.error('AGENTCORE_ENDPOINT not configured');
            return new Response(JSON.stringify({ error: 'Service unavailable - AGENTCORE_ENDPOINT not configured' }), {
                status: 503,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        // Prepare payload for AgentCore streaming endpoint
        const agentPayload = {
            prompt: message,
            session_id: sessionId,
            alert_id: alertId,
            user_id: finalUserId, // Pass user ID in request body
        };

        // Call AgentCore Runtime streaming endpoint with JWT authentication
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
                // No timeout - let the stream run as long as needed
                signal: undefined,
            });
        } catch (fetchError) {
            console.error('Failed to connect to AgentCore:', fetchError);
            return new Response(
                JSON.stringify({
                    error: 'Failed to connect to AgentCore Runtime',
                    details: fetchError instanceof Error ? fetchError.message : 'Unknown error'
                }),
                {
                    status: 502,
                    headers: { 'Content-Type': 'application/json' },
                }
            );
        }

        if (!agentResponse.ok) {
            console.error('AgentCore request failed:', agentResponse.status, agentResponse.statusText);
            const errorText = await agentResponse.text().catch(() => 'Unknown error');
            console.error('AgentCore error response:', errorText);
            return new Response(
                JSON.stringify({
                    error: 'Failed to get response from agent',
                    status: agentResponse.status,
                    details: errorText
                }),
                {
                    status: 502,
                    headers: { 'Content-Type': 'application/json' },
                }
            );
        }

        if (!agentResponse.body) {
            return new Response(
                JSON.stringify({ error: 'No response body from agent' }),
                {
                    status: 502,
                    headers: { 'Content-Type': 'application/json' },
                }
            );
        }

        // Stream the response directly from AgentCore to the client
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
                            // Process any remaining data in buffer
                            if (buffer.trim()) {
                                try {
                                    const event = parseEvent(buffer);
                                    if (event) {
                                        const transformedEvent = transformAgentEvent(event);
                                        if (transformedEvent) {
                                            controller.enqueue(
                                                encoder.encode(JSON.stringify(transformedEvent) + '\n')
                                            );
                                        }
                                    }
                                } catch (e) {
                                    console.error('Failed to parse final buffer:', buffer, e);
                                }
                            }
                            break;
                        }

                        // Decode chunk and add to buffer
                        buffer += decoder.decode(value, { stream: true });

                        // Process complete lines (events separated by newlines)
                        const lines = buffer.split('\n');
                        buffer = lines.pop() || ''; // Keep incomplete line in buffer

                        for (const line of lines) {
                            if (line.trim()) {
                                try {
                                    const event = parseEvent(line);
                                    if (event) {
                                        const transformedEvent = transformAgentEvent(event);
                                        if (transformedEvent) {
                                            controller.enqueue(
                                                encoder.encode(JSON.stringify(transformedEvent) + '\n')
                                            );
                                        }
                                    }
                                } catch (e) {
                                    console.error('Failed to parse event:', line, e);
                                    // Send error to frontend
                                    const errorEvent = {
                                        type: 'error',
                                        data: 'Failed to parse streaming event',
                                    };
                                    controller.enqueue(
                                        encoder.encode(JSON.stringify(errorEvent) + '\n')
                                    );
                                }
                            }
                        }
                    }

                    controller.close();
                } catch (error) {
                    console.error('Streaming error:', error);
                    controller.error(error);
                }
            },
        });

        return new Response(stream, {
            headers: {
                'Content-Type': 'text/plain; charset=utf-8',
                'Cache-Control': 'no-cache, no-transform',
                'Connection': 'keep-alive',
                'X-Accel-Buffering': 'no', // Disable buffering in nginx/proxies
                'Transfer-Encoding': 'chunked',
            },
        });
    } catch (error) {
        console.error('Agent API error:', error);
        return new Response(
            JSON.stringify({
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error',
            }),
            {
                status: 500,
                headers: { 'Content-Type': 'application/json' },
            }
        );
    }
}

/**
 * Parse event from streaming response
 * Handles both plain JSON and Server-Sent Events (SSE) format
 */
function parseEvent(line: string): any | null {
    const trimmed = line.trim();
    if (!trimmed) return null;

    // Handle SSE format: "data: {...}"
    if (trimmed.startsWith('data: ')) {
        const jsonStr = trimmed.substring(6); // Remove "data: " prefix
        try {
            return JSON.parse(jsonStr);
        } catch (e) {
            console.error('Failed to parse SSE data:', jsonStr, e);
            return null;
        }
    }

    // Handle plain JSON
    try {
        return JSON.parse(trimmed);
    } catch (e) {
        console.error('Failed to parse JSON:', trimmed, e);
        return null;
    }
}

/**
 * Transform AgentCore streaming events to frontend format
 * Backend events: content_delta, thinking, result
 * Frontend expects: text, thinking, trace
 */
function transformAgentEvent(event: any): any {
    // Handle error events
    if (event.status === 'error' || event.error) {
        console.error('Backend error:', event);
        return {
            type: 'error',
            data: event.error || event.message || 'Unknown error occurred',
        };
    }

    // Handle content delta events (token-level streaming from model)
    if (event.type === 'content_delta') {
        return {
            type: 'text',
            data: event.data || '',
        };
    }

    // Handle thinking events from callback handlers
    if (event.type === 'thinking') {
        return {
            type: 'thinking',
            data: event.data,
        };
    }

    // Handle trace events (tool calls, reasoning, etc.)
    if (event.type === 'trace') {
        return {
            type: 'trace',
            data: event.data,
        };
    }

    // Handle final result event (completion signal)
    if (event.type === 'result') {
        return {
            type: 'complete',
            data: event.data || 'Completed',
        };
    }

    // Unknown event type, log and skip
    console.warn('Unknown event type:', event.type, event);
    return null;
}
