/**
 * Incoming call handler
 *
 * When Twilio routes an inbound call here, we return TwiML that:
 *   1. Says a brief greeting while the stream opens
 *   2. Opens a bidirectional Media Stream back to this service's /stream path
 *
 * Twilio docs: https://www.twilio.com/docs/voice/twiml/stream
 */

import type { Request, Response } from 'express';
import twilio from 'twilio';

const { VoiceResponse } = twilio.twiml;

export function handleIncomingCall(req: Request, res: Response): void {
  const callSid = req.body?.CallSid ?? 'unknown';
  console.log(`[call] Incoming call: ${callSid} from ${req.body?.From} to ${req.body?.To}`);

  const serviceUrl = process.env.SERVICE_BASE_URL!;
  // Convert https → wss for the WebSocket stream URL
  const streamUrl = serviceUrl.replace(/^https?:\/\//, 'wss://') + '/stream';

  const twiml = new VoiceResponse();

  // Brief pause so the stream has a moment to connect
  twiml.pause({ length: 1 });

  const start = twiml.start();
  start.stream({
    url: streamUrl,
    // Track is 'inbound_track' — we receive caller audio; bidirectional is
    // possible but requires the caller's audio only for STT → AI → TTS flow
    track: 'inbound_track',
  });

  // Keep the call alive while the stream is open (up to 30s default)
  // Increase this if your AI round-trip takes longer
  twiml.pause({ length: 30 });

  // Fallback goodbye if the stream closes before AI responds
  twiml.say(
    { voice: 'Polly.Joanna' },
    "I'm sorry, I didn't catch that. Please call back and we'll get you sorted."
  );

  res.setHeader('Content-Type', 'text/xml');
  res.status(200).send(twiml.toString());

  console.log(`[call] Sent TwiML for ${callSid}, streaming to ${streamUrl}`);
}
