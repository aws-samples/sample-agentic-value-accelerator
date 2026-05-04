import React, { useState, useRef, useEffect } from 'react';
import { 
  Box, 
  Paper, 
  Typography, 
  TextField, 
  IconButton, 
  CircularProgress,
  Avatar,
  Chip,
  FormControl,
  Select,
  MenuItem,
} from '@mui/material';
import { 
  Send as SendIcon, 
  SmartToy as BotIcon,
  Person as PersonIcon,
  Speed as SpeedIcon,
} from '@mui/icons-material';
import { getConfig } from '../config.js';

const MODELS: Record<string, string> = {
  'Claude Sonnet 4': 'us.anthropic.claude-sonnet-4-20250514-v1:0',
  'Claude Haiku 4': 'us.anthropic.claude-haiku-4-20250514-v1:0',
  'Amazon Nova Pro': 'us.amazon.nova-pro-v1:0',
  'Amazon Nova Lite': 'us.amazon.nova-lite-v1:0',
  'Amazon Nova Micro': 'us.amazon.nova-micro-v1:0',
  'AgentCore (SAR Agent)': 'agentcore',
};

interface Metrics {
  model: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  metrics?: Metrics;
}

const ChatPage: React.FC = () => {
  const [selectedModel, setSelectedModel] = useState('Amazon Nova Lite');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Hello! I\'m your AI fraud detection assistant. I can help you analyze transactions, explain fraud patterns, and provide insights about suspicious activities. How can I assist you today?',
      timestamp: new Date()
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [sessionId] = useState(() => `sar-session-${Date.now()}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const callAgent = async (userMessage: string): Promise<string> => {
    const config = getConfig();
    const sarApiBase = config.SAR_API_URL || 'http://localhost:3001';
    const isLocal = !config.SAR_API_URL;
    const modelId = MODELS[selectedModel];
    const useAgentCore = modelId === 'agentcore';

    const history = messages
      .filter(m => m.content && m.id !== '1')
      .map(m => ({ role: m.role, content: m.content.substring(0, 500) }));

    // AgentCore path (streaming, local only)
    if (useAgentCore && isLocal) {
      const res = await fetch(`${sarApiBase}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, sessionId, history }),
      });
      if (!res.ok) throw new Error(`Agent returned ${res.status}`);
      const contentType = res.headers.get('content-type') || '';

      if (contentType.includes('text/event-stream') && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        const placeholderId = (Date.now() + 1).toString();
        setMessages(prev => [...prev, { id: placeholderId, role: 'assistant' as const, content: '▍', timestamp: new Date() }]);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          for (const line of decoder.decode(value, { stream: true }).split('\n')) {
            if (!line.startsWith('data: ')) continue;
            try {
              const evt = JSON.parse(line.slice(6));
              if (evt.text) { fullText += evt.text; setMessages(prev => prev.map(m => m.id === placeholderId ? { ...m, content: fullText } : m)); }
            } catch {}
          }
        }
        const cleaned = fullText.replace(/\nLog:.*$/s, '').trim();
        if (cleaned) setMessages(prev => prev.map(m => m.id === placeholderId ? { ...m, content: cleaned } : m));
        return '__ALREADY_ADDED__';
      }

      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed');
      return data.response || '';
    }

    // AgentCore path (non-streaming, Amplify)
    if (useAgentCore) {
      const res = await fetch(`${sarApiBase}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, sessionId, history }),
      });
      if (!res.ok) throw new Error(`Agent returned ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Failed');
      return data.response || '';
    }

    // Direct Bedrock path (fast, with metrics)
    const t0 = Date.now();
    const res = await fetch(`${sarApiBase}/api/bedrock-chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: userMessage, model: modelId, history }),
    });
    if (!res.ok) throw new Error(`Bedrock returned ${res.status}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Failed');

    const totalMs = Date.now() - t0;
    const metrics: Metrics = {
      model: selectedModel,
      latencyMs: data.metrics?.latencyMs || totalMs,
      inputTokens: data.metrics?.inputTokens || 0,
      outputTokens: data.metrics?.outputTokens || 0,
    };

    // Return with metrics marker
    const assistantMsg: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: data.response,
      timestamp: new Date(),
      metrics,
    };
    setMessages(prev => [...prev, assistantMsg]);
    return '__ALREADY_ADDED__';
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputMessage.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const response = await callAgent(userMessage.content);
      // If response is '__ALREADY_ADDED__', the streaming handler already added the message
      if (response !== '__ALREADY_ADDED__') {
        const assistantMessage: Message = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: response,
          timestamp: new Date()
        };
        setMessages(prev => [...prev, assistantMessage]);
      }
    } catch (error) {
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'I apologize, but I encountered an error processing your request. Please try again.',
        timestamp: new Date()
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <Box sx={{ 
      height: '100%', 
      display: 'flex', 
      flexDirection: 'column',
      fontFamily: '"Amazon Ember", "Helvetica Neue", Arial, sans-serif'
    }}>
      {/* Header */}
      <Paper sx={{ 
        p: 2, 
        mb: 2, 
        backgroundColor: '#131921', 
        color: 'white',
        borderBottom: '3px solid #FF9900'
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <Avatar sx={{ bgcolor: '#FF9900' }}>
            <BotIcon />
          </Avatar>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 600, color: 'white' }}>
              AI Fraud Detection Assistant
            </Typography>
            <Typography variant="body2" sx={{ color: '#FFB84D' }}>
              Powered by Amazon Bedrock AgentCore
            </Typography>
          </Box>
          <FormControl size="small" sx={{ minWidth: 200 }}>
            <Select value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              sx={{ color: 'white', bgcolor: 'rgba(255,255,255,0.1)', '& .MuiSelect-icon': { color: 'white' },
                '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,153,0,0.5)' },
                '&:hover .MuiOutlinedInput-notchedOutline': { borderColor: '#FF9900' },
              }}>
              {Object.keys(MODELS).map(name => (
                <MenuItem key={name} value={name}>{name}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Box>
      </Paper>

      {/* Messages */}
      <Paper sx={{ 
        flex: 1, 
        p: 2, 
        overflow: 'auto',
        backgroundColor: '#f8f9fa',
        border: '1px solid #ddd'
      }}>
        {messages.map((message) => (
          <Box key={message.id} sx={{ mb: 3 }}>
            <Box sx={{ 
              display: 'flex', 
              alignItems: 'flex-start', 
              gap: 2,
              flexDirection: message.role === 'user' ? 'row-reverse' : 'row'
            }}>
              <Avatar sx={{ 
                bgcolor: message.role === 'user' ? '#FF9900' : '#232F3E',
                width: 32,
                height: 32
              }}>
                {message.role === 'user' ? <PersonIcon /> : <BotIcon />}
              </Avatar>
              
              <Box sx={{ 
                maxWidth: '80%',
                backgroundColor: message.role === 'user' ? '#FF9900' : 'white',
                color: message.role === 'user' ? '#131921' : '#0f1111',
                p: 2,
                borderRadius: 2,
                border: message.role === 'user' ? 'none' : '1px solid #ddd',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}>
                <Typography variant="body1" sx={{ 
                  whiteSpace: 'pre-wrap',
                  lineHeight: 1.5,
                  fontWeight: message.role === 'user' ? 500 : 400
                }}>
                  {message.content}
                </Typography>
                <Typography variant="caption" sx={{ 
                  display: 'block', 
                  mt: 1, 
                  opacity: 0.7,
                  fontSize: '0.75rem'
                }}>
                  {message.timestamp.toLocaleTimeString()}
                  {message.metrics && (
                    <span style={{ marginLeft: 8 }}>
                      ⚡ {(message.metrics.latencyMs / 1000).toFixed(1)}s · {message.metrics.model} · {message.metrics.outputTokens} tokens
                    </span>
                  )}
                </Typography>
              </Box>
            </Box>
          </Box>
        ))}
        
        {isLoading && (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
            <Avatar sx={{ bgcolor: '#232F3E', width: 32, height: 32 }}>
              <BotIcon />
            </Avatar>
            <Box sx={{ 
              backgroundColor: 'white',
              p: 2,
              borderRadius: 2,
              border: '1px solid #ddd',
              display: 'flex',
              alignItems: 'center',
              gap: 1
            }}>
              <CircularProgress size={16} />
              <Typography variant="body2" sx={{ color: '#565959' }}>
                Analyzing with AgentCore...
              </Typography>
            </Box>
          </Box>
        )}
        
        <div ref={messagesEndRef} />
      </Paper>

      {/* Input */}
      <Paper sx={{ 
        p: 2, 
        mt: 2,
        backgroundColor: 'white',
        border: '1px solid #ddd'
      }}>
        <Box sx={{ display: 'flex', gap: 1, alignItems: 'flex-end' }}>
          <TextField
            fullWidth
            multiline
            maxRows={4}
            placeholder="Ask me about fraud detection, transaction analysis, or any suspicious patterns..."
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isLoading}
            sx={{
              '& .MuiOutlinedInput-root': {
                fontFamily: '"Amazon Ember", "Helvetica Neue", Arial, sans-serif',
                '& fieldset': {
                  borderColor: '#a6a6a6',
                },
                '&:hover fieldset': {
                  borderColor: '#FF9900',
                },
                '&.Mui-focused fieldset': {
                  borderColor: '#FF9900',
                },
              },
            }}
          />
          <IconButton
            onClick={handleSendMessage}
            disabled={!inputMessage.trim() || isLoading}
            sx={{
              backgroundColor: '#FF9900',
              color: '#131921',
              '&:hover': {
                backgroundColor: '#FFB84D',
              },
              '&:disabled': {
                backgroundColor: '#f0f0f0',
                color: '#a6a6a6',
              },
              width: 48,
              height: 48
            }}
          >
            <SendIcon />
          </IconButton>
        </Box>
        
        <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
          <Chip 
            label="Investigate A705" 
            size="small" 
            onClick={() => setInputMessage('Investigate account A705 for suspicious activity')}
            sx={{ fontSize: '0.75rem' }}
          />
          <Chip 
            label="HOLD_AND_CASE count" 
            size="small" 
            onClick={() => setInputMessage('How many HOLD_AND_CASE transactions are there?')}
            sx={{ fontSize: '0.75rem' }}
          />
          <Chip 
            label="Top risky accounts" 
            size="small" 
            onClick={() => setInputMessage('Which accounts have the most HOLD_AND_CASE decisions?')}
            sx={{ fontSize: '0.75rem' }}
          />
          <Chip 
            label="What can you do?" 
            size="small" 
            onClick={() => setInputMessage('What tools do you have?')}
            sx={{ fontSize: '0.75rem' }}
          />
        </Box>
      </Paper>
    </Box>
  );
};

export default ChatPage;
