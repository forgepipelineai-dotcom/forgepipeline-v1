/**
 * Twilio Media Stream WebSocket handler
 *
 * Protocol (Twilio → us):
 *   { event: 'connected' }
 *   { event: 'start',  start:  { streamSid, callSid, accountSid, tracks, ... } }
 *   { event: 'media',  media:  { track, chunk, timestamp, payload } }  ← base64 mulaw 8kHz
 *   { event: 'stop',   stop:   { streamSid, accountSid, callSid } }
 *
 * Pipeline per call:
 *   Twilio audio → Deepgram live STT → Anthropic Claude → ElevenLabs TTS
 *   → MP3 URL → Twilio REST API (redirect call to <Play> TwiML)
 */

import type { WebSocket } from 'ws';
import Anthropic from '@anthropic-ai/sdk';
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import twilio from 'twilio';
import { v4 as uuidv4 } from 'uuid';

// ─── Clients ─────────────────────────────────────────────────────────────────
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
const deepgram  = createClient(process.env.DEEPGRAM_API_KEY!);
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

// ─── Session state ────────────────────────────────────────────────────────────
interface StreamSession {
  sessionId:  string;
  streamSid:  string | null;
  callSid:    string | null;
  transcript: string;
  responded:  boolean;
}

// ─── Main handler ─────────────────────────────────────────────────────────────
export function handleStreamConnection(ws: WebSocket): void {
  const session: StreamSession = {
    sessionId:  uuidv4(),
    streamSid:  null,
    callSid:    null,
    transcript: '',
    responded:  false,
  };

  console.log(`[stream:${session.sessionId}] Session opened`);

  // ── Open a live Deepgram connection for this call ──────────────────────────
  const dgConnection = deepgram.listen.live({
    model:        'nova-2',
    language:     'en-US',
    encoding:     'mulaw',
    sample_rate:  8000,
    channels:     1,
    smart_format: true,
    interim_results: true,
    utterance_end_ms: 1200,   // fire final after 1.2s of silence
    vad_events:      true,
  });

  // Final transcript ready → call AI
  dgConnection.on(LiveTranscriptionEvents.Transcript, async (data) => {
    const alt = data.channel?.alternatives?.[0];
    if (!alt?.transcript || alt.transcript.trim() === '') return;

    const isFinal = data.is_final && data.speech_final;
    if (!isFinal) return;

    session.transcript = alt.transcript.trim();
    console.log(`[stream:${session.sessionId}] Final transcript: "${session.transcript}"`);

    // Only respond once per call (can be extended to multi-turn later)
    if (session.responded) return;
    session.responded = true;

    await handleAIResponse(session);
  });

  dgConnection.on(LiveTranscriptionEvents.Error, (err) => {
    console.error(`[stream:${session.sessionId}] Deepgram error:`, err);
  });

  dgConnection.on(LiveTranscriptionEvents.Close, () => {
    console.log(`[stream:${session.sessionId}] Deepgram connection closed`);
  });

  // ── Twilio WebSocket message handler ──────────────────────────────────────
  ws.on('message', (raw) => {
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      return;
    }

    const event = msg.event as string;

    if (event === 'connected') {
      console.log(`[stream:${session.sessionId}] Twilio connected`);
    }

    if (event === 'start') {
      const start = msg.start as Record<string, string>;
      session.streamSid = start.streamSid;
      session.callSid   = start.callSid;
      console.log(`[stream:${session.sessionId}] Stream started — callSid: ${session.callSid}`);
    }

    if (event === 'media') {
      const media = msg.media as Record<string, string>;
      // Decode base64 mulaw audio and send to Deepgram
      const audio = Buffer.from(media.payload, 'base64');
      if (dgConnection.getReadyState() === 1 /* OPEN */) {
        dgConnection.send(audio);
      }
    }

    if (event === 'stop') {
      console.log(`[stream:${session.sessionId}] Stream stopped by Twilio`);
      dgConnection.finish();
    }
  });

  ws.on('close', () => {
    console.log(`[stream:${session.sessionId}] WebSocket closed`);
    dgConnection.finish();
  });

  ws.on('error', (err) => {
    console.error(`[stream:${session.sessionId}] WebSocket error:`, err);
    dgConnection.finish();
  });
}

// ─── AI response pipeline ─────────────────────────────────────────────────────
async function handleAIResponse(session: StreamSession): Promise<void> {
  if (!session.callSid || !session.transcript) return;

  console.log(`[stream:${session.sessionId}] Calling Anthropic for: "${session.transcript}"`);

  try {
    // 1. Generate AI text response
    const aiMsg = await anthropic.messages.create({
      model:      'claude-opus-4-5',
      max_tokens: 200,
      system: [
        'You are a helpful AI assistant for ForgePipeline, an AI-powered lead response service for contractors.',
        'You are answering an inbound phone call. Keep responses SHORT — 2–3 sentences max.',
        'Sound natural, warm, and professional. Do not use lists or formatting.',
        'If someone is calling about a job, ask for their name and what they need done.',
      ].join(' '),
      messages: [
        { role: 'user', content: session.transcript },
      ],
    });

    const textContent = aiMsg.content.find((c) => c.type === 'text');
    const responseText = textContent?.text ?? "Thanks for calling. How can I help you today?";
    console.log(`[stream:${session.sessionId}] AI response: "${responseText}"`);

    // 2. Convert to speech — here we use ElevenLabs if configured, else Twilio Polly fallback
    const audioUrl = await textToSpeechUrl(responseText, session.sessionId);

    // 3. Redirect the live call to play the audio
    if (audioUrl) {
      await twilioClient.calls(session.callSid!).update({
        twiml: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Play>${audioUrl}</Play>
  <Pause length="1"/>
  <Say voice="Polly.Joanna">Is there anything else I can help you with?</Say>
</Response>`,
      });
      console.log(`[stream:${session.sessionId}] Redirected call to AI audio`);
    } else {
      // Fallback: use Twilio's built-in TTS if no audio URL
      await twilioClient.calls(session.callSid!).update({
        twiml: `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${escapeXml(responseText)}</Say>
  <Pause length="1"/>
</Response>`,
      });
      console.log(`[stream:${session.sessionId}] Redirected call to Polly TTS (ElevenLabs fallback)`);
    }

  } catch (err) {
    console.error(`[stream:${session.sessionId}] AI pipeline error:`, err);
  }
}

// ─── TTS via ElevenLabs ───────────────────────────────────────────────────────
async function textToSpeechUrl(text: string, sessionId: string): Promise<string | null> {
  const apiKey  = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;
  const baseUrl = process.env.SERVICE_BASE_URL; // We need a place to serve the audio

  if (!apiKey || !voiceId) {
    console.warn(`[stream:${sessionId}] ElevenLabs not configured — using Polly fallback`);
    return null;
  }

  try {
    // ElevenLabs streaming → we return null here and let the caller use Polly
    // TODO: implement ElevenLabs audio generation + storage (S3/Cloudinary) and return URL
    // For now, return null to trigger Polly fallback until storage is wired
    console.log(`[stream:${sessionId}] ElevenLabs TTS stub — returning null (use Polly)`);
    return null;
  } catch (err) {
    console.error(`[stream:${sessionId}] ElevenLabs error:`, err);
    return null;
  }
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
