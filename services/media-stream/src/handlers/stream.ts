/**
 * Twilio Media Stream WebSocket handler
 *
 * ── Audio flow (caller → AI → caller) ─────────────────────────────────────────
 *
 *  1. Twilio opens a WebSocket to /stream when the call starts.
 *  2. Caller speaks → Twilio sends media events with base64-encoded mulaw audio.
 *  3. We forward audio chunks to Deepgram nova-3 live STT over a persistent
 *     WebSocket connection per call.
 *  4. Deepgram returns a final transcript (speech_final = true).
 *  5. We pass the transcript to the LLM adapter (claude-haiku-4-5-20251001 by
 *     default; claude-sonnet-5 on escalation).
 *  6. We send the AI text to ElevenLabs and request ulaw_8000 output — the same
 *     encoding Twilio's media stream uses, so no conversion is needed.
 *  7. We chunk the ulaw audio and send it back over the SAME open WebSocket
 *     that is receiving the caller's audio, as Twilio media events.
 *
 * ── Why no Twilio REST redirect ────────────────────────────────────────────────
 *
 *  The previous implementation (commit db79e05) called:
 *
 *    twilioClient.calls(callSid).update({ twiml: '<Response><Play>...' })
 *
 *  That is a REST API call that tears down the current TwiML execution context,
 *  starts a new one, and has the call bridge to a new audio source. It drops out
 *  of the live bidirectional stream for every response turn, re-establishing call
 *  control each time — adding 500ms–2s of seam latency on every reply.
 *
 *  The correct mechanism: keep the WebSocket open. Twilio Media Streams supports
 *  bidirectional audio over the same connection. To send audio back to the caller
 *  we write a "media" event to the WebSocket:
 *
 *    ws.send(JSON.stringify({
 *      event:     'media',
 *      streamSid: session.streamSid,
 *      media:     { payload: base64(chunk_of_ulaw_8kHz_audio) }
 *    }))
 *
 *  Twilio plays the chunks in real time as they arrive. No new call leg, no TwiML
 *  round-trip, no redirect. One WebSocket, open for the full call.
 *
 * ── Twilio Media Streams protocol (reference) ─────────────────────────────────
 *
 *  Inbound events (Twilio → us):
 *    { event: 'connected' }
 *    { event: 'start',  start:  { streamSid, callSid, ... } }
 *    { event: 'media',  media:  { payload: base64<mulaw 8kHz> } }
 *    { event: 'stop',   stop:   { ... } }
 *
 *  Outbound (us → Twilio):
 *    { event: 'media',  streamSid: '...', media: { payload: base64<mulaw 8kHz> } }
 *    { event: 'mark',   streamSid: '...', mark:  { name: 'done' } }
 *    { event: 'clear',  streamSid: '...' }   ← interrupt mid-playback
 */

import type { WebSocket } from 'ws';
import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import { chat } from '../lib/llm.js';
import { v4 as uuidv4 } from 'uuid';
import https from 'https';

// ─── Clients ──────────────────────────────────────────────────────────────────
const deepgram = createClient(process.env.DEEPGRAM_API_KEY!);

// ─── Voice config (ElevenLabs) ────────────────────────────────────────────────
const EL_VOICE_ID = process.env.ELEVENLABS_VOICE_ID!;
const EL_API_KEY  = process.env.ELEVENLABS_API_KEY;

// Chunk size for streaming ulaw audio back to Twilio.
// 160 bytes = 20ms at 8kHz mono 8-bit — matches Twilio's incoming chunk cadence.
const ULAW_CHUNK_BYTES = 160;

// ─── Session state ────────────────────────────────────────────────────────────
interface Session {
  id:        string;
  streamSid: string | null;
  callSid:   string | null;
  history:   Array<{ role: 'user' | 'assistant'; content: string }>;
  speaking:  boolean;   // true while we are streaming audio back
}

// ─── Deepgram nova-3 live connection ─────────────────────────────────────────
function openDeepgramConnection() {
  return deepgram.listen.live({
    model:            'nova-3',      // Fixed: was nova-2
    language:         'en-US',
    encoding:         'mulaw',
    sample_rate:      8000,
    channels:         1,
    smart_format:     true,
    interim_results:  true,
    utterance_end_ms: 1200,
    vad_events:       true,
  });
}

// ─── ElevenLabs: text → ulaw 8kHz audio bytes ────────────────────────────────
//
// We request ulaw_8000 output from ElevenLabs.  This is exactly the encoding
// Twilio Media Streams uses (mulaw, 8kHz, mono, 8-bit), so we can pipe the
// bytes directly into Twilio media events with no conversion step.
//
function elevenLabsTTS(text: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    if (!EL_API_KEY || !EL_VOICE_ID) {
      reject(new Error('ElevenLabs not configured (ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID)'));
      return;
    }

    const body = JSON.stringify({
      text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    });

    const options = {
      hostname: 'api.elevenlabs.io',
      path:     `/v1/text-to-speech/${EL_VOICE_ID}?output_format=ulaw_8000`,
      method:   'POST',
      headers:  {
        'xi-api-key':   EL_API_KEY,
        'Content-Type': 'application/json',
        'Accept':       'audio/basic',   // mime type for ulaw
      },
    };

    const req = https.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => {
        if ((res.statusCode ?? 0) >= 400) {
          reject(new Error(`ElevenLabs ${res.statusCode}: ${Buffer.concat(chunks).toString()}`));
        } else {
          resolve(Buffer.concat(chunks));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Send ulaw audio back to the caller over the open WebSocket ───────────────
//
// This is the core of the bidirectional approach.  There is NO call to
// twilioClient.calls().update() anywhere in this function.  We write directly
// to the same ws that is receiving the caller's audio.
//
function streamAudioToTwilio(ws: WebSocket, session: Session, audioBuffer: Buffer): void {
  if (!session.streamSid) {
    console.warn(`[${session.id}] streamSid not set — cannot send audio`);
    return;
  }
  if (ws.readyState !== ws.OPEN) {
    console.warn(`[${session.id}] WebSocket closed before audio could be sent`);
    return;
  }

  session.speaking = true;

  let offset = 0;
  while (offset < audioBuffer.length) {
    const chunk = audioBuffer.subarray(offset, offset + ULAW_CHUNK_BYTES);
    offset += ULAW_CHUNK_BYTES;

    ws.send(JSON.stringify({
      event:     'media',
      streamSid: session.streamSid,
      media:     { payload: chunk.toString('base64') },
    }));
  }

  // Send a mark event so we know when Twilio has finished playing
  ws.send(JSON.stringify({
    event:     'mark',
    streamSid: session.streamSid,
    mark:      { name: `done-${Date.now()}` },
  }));

  session.speaking = false;
}

// ─── Full AI pipeline: transcript → LLM → TTS → WebSocket audio ──────────────
async function handleTranscript(
  ws:       WebSocket,
  session:  Session,
  transcript: string,
): Promise<void> {
  console.log(`[${session.id}] Transcript: "${transcript}"`, );

  // Detect emergencies for escalation (simple keyword heuristic — extend as needed)
  const isEmergency = /\b(emergency|urgent|hurt|injured|fire|flood|dying|bleed)\b/i.test(transcript);

  // Append to conversation history for multi-turn context
  session.history.push({ role: 'user', content: transcript });

  const SYSTEM = [
    'You are a helpful AI assistant answering an inbound phone call on behalf of a home-services contractor business (ForgePipeline).',
    'Keep responses SHORT — two or three sentences maximum. Sound natural and warm.',
    'If the caller describes a genuine emergency (fire, injury, gas leak) escalate urgency.',
    'Ask for the caller\'s name and what service they need if they haven\'t said yet.',
  ].join(' ');

  let llmResp;
  try {
    llmResp = await chat({
      system:   SYSTEM,
      messages: session.history,
      escalate: isEmergency,
    });
  } catch (err) {
    console.error(`[${session.id}] LLM error:`, err);
    return;
  }

  console.log(`[${session.id}] LLM (${llmResp.model}): "${llmResp.text}"`);

  // Append assistant turn to history
  session.history.push({ role: 'assistant', content: llmResp.text });

  // Convert AI text to ulaw audio via ElevenLabs
  let audioBuffer: Buffer;
  try {
    audioBuffer = await elevenLabsTTS(llmResp.text);
    console.log(`[${session.id}] ElevenLabs: ${audioBuffer.length} bytes ulaw`);
  } catch (err) {
    console.error(`[${session.id}] ElevenLabs TTS failed:`, err);
    // No fallback redirect — log and continue; caller will hear silence for this turn
    return;
  }

  // ── Send audio back over the open WebSocket — no REST call, no redirect ──
  streamAudioToTwilio(ws, session, audioBuffer);
}

// ─── Main WebSocket connection handler ───────────────────────────────────────
export function handleStreamConnection(ws: WebSocket): void {
  const session: Session = {
    id:        uuidv4(),
    streamSid: null,
    callSid:   null,
    history:   [],
    speaking:  false,
  };

  console.log(`[${session.id}] Stream connection opened`);

  // Open Deepgram live STT connection for this call
  const dg = openDeepgramConnection();

  // Final transcript from Deepgram
  dg.on(LiveTranscriptionEvents.Transcript, (data) => {
    const alt = data.channel?.alternatives?.[0];
    if (!alt?.transcript?.trim()) return;
    if (!data.is_final || !data.speech_final) return;  // wait for full utterance

    handleTranscript(ws, session, alt.transcript.trim()).catch((err) =>
      console.error(`[${session.id}] handleTranscript error:`, err),
    );
  });

  dg.on(LiveTranscriptionEvents.Error, (err) =>
    console.error(`[${session.id}] Deepgram error:`, err),
  );
  dg.on(LiveTranscriptionEvents.Close, () =>
    console.log(`[${session.id}] Deepgram closed`),
  );

  // Handle mark events (Twilio confirms audio playback finished)
  ws.on('message', (raw) => {
    let msg: Record<string, unknown>;
    try { msg = JSON.parse(raw.toString()); }
    catch { return; }

    switch (msg.event) {
      case 'connected':
        console.log(`[${session.id}] Twilio connected`);
        break;

      case 'start': {
        const s = msg.start as Record<string, string>;
        session.streamSid = s.streamSid;
        session.callSid   = s.callSid;
        console.log(`[${session.id}] Stream started — callSid: ${session.callSid}`);
        break;
      }

      case 'media': {
        // Forward caller audio to Deepgram — only when we are NOT speaking
        // (avoid feeding our own output back into STT)
        if (session.speaking) return;
        const m = msg.media as Record<string, string>;
        const audio = Buffer.from(m.payload, 'base64');
        if (dg.getReadyState() === 1 /* OPEN */) {
          dg.send(audio);
        }
        break;
      }

      case 'mark':
        // Twilio confirms our audio was played
        console.log(`[${session.id}] Mark received: ${(msg.mark as any)?.name}`);
        break;

      case 'stop':
        console.log(`[${session.id}] Stream stopped`);
        dg.finish();
        break;
    }
  });

  ws.on('close', () => {
    console.log(`[${session.id}] WebSocket closed`);
    dg.finish();
  });

  ws.on('error', (err) => {
    console.error(`[${session.id}] WebSocket error:`, err);
    dg.finish();
  });
}
