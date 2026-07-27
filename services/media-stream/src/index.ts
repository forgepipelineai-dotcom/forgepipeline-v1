/**
 * ForgePipeline Media Stream Service
 *
 * Handles Twilio Media Streams WebSocket connections for real-time voice AI:
 *   1. Receives raw mulaw audio from Twilio via WebSocket
 *   2. Streams audio to Deepgram for real-time STT
 *   3. Sends transcript to Anthropic for AI response
 *   4. Converts AI text → speech via ElevenLabs, plays back via Twilio REST
 *
 * Endpoints:
 *   GET  /health          → health check for Render
 *   POST /incoming-call   → returns TwiML that opens a Media Stream
 *   GET  /stream          → Twilio WebSocket connection (upgraded from HTTP)
 */

import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { handleIncomingCall } from './handlers/call.js';
import { handleStreamConnection } from './handlers/stream.js';

// ─── Validate required env vars at startup ────────────────────────────────────
const REQUIRED_ENV = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_AUTH_TOKEN',
  'DEEPGRAM_API_KEY',
  'ANTHROPIC_API_KEY',
  'SERVICE_BASE_URL',
];

for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`[startup] Missing required env var: ${key}`);
    process.exit(1);
  }
}

const PORT = parseInt(process.env.PORT || '8080', 10);

// ─── HTTP server ──────────────────────────────────────────────────────────────
const app = express();
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

// Health check — Render pings this every 30s
app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true, service: 'media-stream', ts: Date.now() });
});

// Twilio calls this when a call arrives; we return TwiML to open a media stream
app.post('/incoming-call', handleIncomingCall);

// ─── WebSocket server (same port, path=/stream) ───────────────────────────────
const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/stream' });

wss.on('connection', (ws, req) => {
  console.log(`[ws] New connection from ${req.socket.remoteAddress}`);
  handleStreamConnection(ws);
});

wss.on('error', (err) => {
  console.error('[wss] Server error:', err);
});

server.listen(PORT, () => {
  console.log(`[server] Media stream service listening on port ${PORT}`);
  console.log(`[server] Health: http://localhost:${PORT}/health`);
  console.log(`[server] Incoming call TwiML: POST http://localhost:${PORT}/incoming-call`);
  console.log(`[server] WebSocket stream: ws://localhost:${PORT}/stream`);
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────
process.on('SIGTERM', () => {
  console.log('[server] SIGTERM received — shutting down gracefully');
  wss.close(() => {
    server.close(() => {
      console.log('[server] Closed');
      process.exit(0);
    });
  });
});
