# API Services Documentation

This directory contains all API service modules for the Trade Alerts application.

## Services

### 1. Messages Service (`messagesService.ts`)

Handles conversation message persistence with DynamoDB through the Alert API Lambda function.

**Features:**
- Load conversation history on page load
- Save user messages to DynamoDB
- Save agent messages with complete audit trails to DynamoDB
- Automatic user ID extraction from Cognito session

**API Endpoints Used:**
- `GET /conversations/{alertId}/{userId}` - Retrieve message history
- `POST /conversations` - Save new message

**Usage:**
```typescript
import { messagesService } from '@/lib/api/messagesService';

// Load messages
const response = await messagesService.getMessages(alertId);

// Save user message
await messagesService.saveUserMessage(alertId, messageId, content, timestamp);

// Save agent message with audit trail
await messagesService.saveAgentMessage(alertId, messageId, content, auditTrail, timestamp);
```

### 2. Agent Service (`agentService.ts`)

Handles real-time communication with the AgentCore Runtime for streaming agent responses.

**Features:**
- Send messages to agent
- Stream agent responses in real-time
- Capture audit trail events (thinking, tool calls, routing)
- Handle errors gracefully

**API Endpoints Used:**
- `POST /api/agent/chat` - Send message and receive streaming response

**Usage:**
```typescript
import { agentService } from '@/lib/api/agentService';

await agentService.sendMessage({
    alertId,
    message,
    sessionId,
    onChunk: (chunk) => console.log(chunk),
    onComplete: () => console.log('Done'),
    onError: (error) => console.error(error)
});
```

## Hooks

### `useAgentChat` Hook

React hook that combines agent service and messages service for complete chat functionality.

**Features:**
- Loads conversation history from DynamoDB on mount
- Manages local message state
- Handles streaming responses
- Automatically saves messages to DynamoDB
- Deduplicates audit trail events
- Provides loading states

**Usage:**
```typescript
import { useAgentChat } from '@/lib/hooks/useAgentChat';

const {
    messages,              // All messages (user + agent)
    isProcessing,          // Agent is processing
    isLoadingHistory,      // Loading from DynamoDB
    error,                 // Error message if any
    sendMessage,           // Function to send message
    currentStreamingMessage, // Current streaming text
    currentAuditTrail      // Current audit trail entries
} = useAgentChat({ alertId });
```

## Data Flow

### Message Retrieval Flow
1. User opens chat page
2. `useAgentChat` hook mounts
3. Hook calls `messagesService.getMessages(alertId)`
4. Messages service fetches from API Gateway → Lambda → DynamoDB
5. Messages displayed in UI

### Message Persistence Flow
1. User sends message
2. Hook generates UUID and timestamp
3. User message saved to DynamoDB via `messagesService.saveUserMessage()`
4. Message sent to agent via `agentService.sendMessage()`
5. Agent streams response with audit trail
6. On completion, agent message saved to DynamoDB via `messagesService.saveAgentMessage()`

## Environment Variables

Required in `.env.local`:
```
NEXT_PUBLIC_API_ENDPOINT=https://your-api-gateway-url.amazonaws.com/dev
```

## Authentication

All API calls automatically include Cognito JWT tokens:
- Messages API uses `idToken` in Authorization header
- User ID extracted from Cognito session (email or username)

## Error Handling

- Network errors are caught and logged
- Failed message saves don't block UI (messages still shown locally)
- 404 responses return empty message arrays
- Authentication errors return appropriate error messages

## Dependencies

- `uuid` - Generate unique message IDs
- `aws-amplify` - Cognito authentication
- `next` - API routes and server-side functionality
