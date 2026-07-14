// ForgePipeline AI - Twilio Client
// Handles SMS sending, call management, missed-call text-back

import twilio from 'twilio';

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID!,
  process.env.TWILIO_AUTH_TOKEN!
);

export { client as twilioClient };

// Send an SMS message
export async function sendSMS({
  to,
  from,
  body,
}: {
  to: string;
  from?: string;
  body: string;
}) {
  const messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID?.trim();
  const payload: {
    to: string;
    body: string;
    from?: string;
    messagingServiceSid?: string;
  } = {
    to: normalizePhone(to),
    body,
  };

  if (from) {
    payload.from = normalizePhone(from);
  } else if (messagingServiceSid) {
    payload.messagingServiceSid = messagingServiceSid;
  } else {
    throw new Error('TWILIO_MESSAGING_SERVICE_SID or from number is required to send SMS');
  }

  const message = await client.messages.create(payload);
  return message;
}

// Send missed call text-back immediately
export async function sendMissedCallTextBack({
  callerPhone,
  businessPhone,
  message,
}: {
  callerPhone: string;
  businessPhone: string;
  message: string;
}) {
  return sendSMS({
    to: callerPhone,
    from: businessPhone,
    body: message,
  });
}

// Validate Twilio webhook signature
export function validateTwilioSignature(
  authToken: string,
  signature: string,
  url: string,
  params: Record<string, string>
): boolean {
  return twilio.validateRequest(authToken, signature, url, params);
}

// Normalize phone to E.164 format
export function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.startsWith('+')) return trimmed;

  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

// Format phone for display
export function formatPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '').slice(-10);
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

// Check if a message is from a potential opt-out
export function isOptOut(message: string): boolean {
  const optOutKeywords = ['stop', 'unsubscribe', 'cancel', 'quit', 'end', 'opt out'];
  return optOutKeywords.some((kw) =>
    message.toLowerCase().trim().startsWith(kw)
  );
}

// Check if urgent/emergency
export function detectEmergency(message: string): boolean {
  const emergencyKeywords = [
    'emergency', 'urgent', 'asap', 'immediately', 'flooding', 'burst',
    'no heat', 'no ac', 'leak', 'fire', 'dangerous', 'help', 'right now'
  ];
  const lower = message.toLowerCase();
  return emergencyKeywords.some((kw) => lower.includes(kw));
}
