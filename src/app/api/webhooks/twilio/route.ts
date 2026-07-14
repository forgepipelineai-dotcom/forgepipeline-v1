// ForgePipeline AI - Twilio Webhook Handler
// Processes: missed calls → instant AI text-back
//            inbound SMS → AI conversation replies

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { generateAIResponse } from '@/lib/ai/respond';
import { sendSMS, normalizePhone, isOptOut, detectEmergency } from '@/lib/twilio/client';
import { validateTwilioSignature } from '@/lib/twilio/client';
import type { TwilioInboundMessage, TwilioMissedCall } from '@/types';

// POST /api/webhooks/twilio
// Handles both missed calls and inbound SMS
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const params = Object.fromEntries(formData.entries()) as Record<string, string>;

  // Validate Twilio signature in production
  if (process.env.NODE_ENV === 'production') {
    const signature = req.headers.get('x-twilio-signature') || '';
    const url = process.env.WEBHOOK_BASE_URL + '/api/webhooks/twilio';
    const isValid = validateTwilioSignature(
      process.env.TWILIO_AUTH_TOKEN!,
      signature,
      url,
      params
    );
    if (!isValid) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 403 });
    }
  }

  const callStatus = params.CallStatus;
  const from = params.From;
  const to = params.To;

  // ─────────────────────────────────────────────
  // MISSED CALL HANDLER
  // ─────────────────────────────────────────────
  if (callStatus) {
    return handleMissedCall(params as unknown as TwilioMissedCall);
  }

  // ─────────────────────────────────────────────
  // INBOUND SMS HANDLER
  // ─────────────────────────────────────────────
  if (params.Body) {
    return handleInboundSMS(params as unknown as TwilioInboundMessage);
  }

  return NextResponse.json({ ok: true });
}

// ─────────────────────────────────────────────
async function handleMissedCall(params: TwilioMissedCall) {
  const { CallSid, From, To, CallStatus } = params;

  // Only process missed/no-answer calls
  if (!['no-answer', 'busy', 'failed'].includes(CallStatus)) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  // Find organization by business phone
  const org = await prisma.organization.findFirst({
    where: { phone: normalizePhone(To) },
    include: { integrations: true },
  });

  if (!org) {
    console.warn('No org found for phone:', To);
    return NextResponse.json({ ok: true, warning: 'org_not_found' });
  }

  // Check if we already processed this call
  const existingCall = await prisma.callLog.findUnique({
    where: { twilioCallSid: CallSid },
  });
  if (existingCall) {
    return NextResponse.json({ ok: true, skipped: 'duplicate' });
  }

  // Find or create lead
  const normalizedFrom = normalizePhone(From);
  let lead = await prisma.lead.findFirst({
    where: { organizationId: org.id, phone: normalizedFrom },
    orderBy: { createdAt: 'desc' },
  });

  if (!lead) {
    lead = await prisma.lead.create({
      data: {
        organizationId: org.id,
        phone: normalizedFrom,
        source: 'MISSED_CALL',
        status: 'NEW',
        stage: 'new',
        priority: 'MEDIUM',
      },
    });
  }

  // Log the call
  const callLog = await prisma.callLog.create({
    data: {
      organizationId: org.id,
      leadId: lead.id,
      twilioCallSid: CallSid,
      from: normalizedFrom,
      to: normalizePhone(To),
      direction: 'inbound',
      status: 'missed',
    },
  });

  // Generate AI text-back response
  const aiConfig = {
    businessName: org.name,
    industry: (org.industry as any) || 'other',
    personaName: org.aiPersona || 'Alex',
    responseStyle: 'friendly' as const,
    includeBookingLink: false,
    customInstructions: undefined,
  };

  try {
    const aiResponse = await generateAIResponse({
      callerPhone: normalizedFrom,
      config: aiConfig,
      context: 'missed_call',
    });

    // Send the text-back
    await sendSMS({
      to: normalizedFrom,
      from: normalizePhone(To),
      body: aiResponse.message,
    });

    // Update call log
    await prisma.callLog.update({
      where: { id: callLog.id },
      data: {
        textBackSent: true,
        textBackAt: new Date(),
        textBackMsg: aiResponse.message,
      },
    });

    // Log message
    await prisma.message.create({
      data: {
        organizationId: org.id,
        leadId: lead.id,
        from: normalizePhone(To),
        to: normalizedFrom,
        body: aiResponse.message,
        direction: 'OUTBOUND',
        aiGenerated: true,
        aiModel: 'gpt-4o-mini',
        status: 'sent',
      },
    });

    // Update lead
    await prisma.lead.update({
      where: { id: lead.id },
      data: {
        aiResponded: true,
        aiResponseAt: new Date(),
        status: 'CONTACTED',
      },
    });

    // Log activity
    await prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        type: 'ai_response',
        description: `AI sent missed-call text-back`,
        metadata: { message: aiResponse.message, intent: aiResponse.intent },
      },
    });

    // Track analytics
    await prisma.analyticsEvent.create({
      data: {
        organizationId: org.id,
        event: 'call.missed.textback_sent',
        properties: { leadId: lead.id, intent: aiResponse.intent },
      },
    });

  } catch (err) {
    console.error('AI text-back failed:', err);
    // Don't throw - log and continue
  }

  // Return TwiML
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
    { headers: { 'Content-Type': 'text/xml' } }
  );
}

// ─────────────────────────────────────────────
async function handleInboundSMS(params: TwilioInboundMessage) {
  const { MessageSid, From, To, Body } = params;

  // Check opt-out
  if (isOptOut(Body)) {
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`,
      { headers: { 'Content-Type': 'text/xml' } }
    );
  }

  const org = await prisma.organization.findFirst({
    where: { phone: normalizePhone(To) },
  });
  if (!org) {
    return NextResponse.json({ ok: true, warning: 'org_not_found' });
  }

  // Find or create lead
  let lead = await prisma.lead.findFirst({
    where: { organizationId: org.id, phone: normalizePhone(From) },
    orderBy: { createdAt: 'desc' },
    include: {
      messages: { orderBy: { sentAt: 'desc' }, take: 10 },
    },
  });

  if (!lead) {
    lead = await prisma.lead.create({
      data: {
        organizationId: org.id,
        phone: normalizePhone(From),
        source: 'INBOUND_SMS',
        status: 'NEW',
        stage: 'new',
      },
      include: { messages: true },
    });
  }

  // Log inbound message
  await prisma.message.create({
    data: {
      organizationId: org.id,
      leadId: lead.id,
      twilioSid: MessageSid,
      from: normalizePhone(From),
      to: normalizePhone(To),
      body: Body,
      direction: 'INBOUND',
      status: 'received',
    },
  });

  // Build conversation history
  const history = (lead as any).messages?.map((m: any) => ({
    role: m.direction === 'OUTBOUND' ? 'assistant' as const : 'user' as const,
    content: m.body,
  })) || [];

  // Check for emergency
  const isUrgent = detectEmergency(Body);

  // Generate AI reply
  const aiConfig = {
    businessName: org.name,
    industry: (org.industry as any) || 'other',
    personaName: org.aiPersona || 'Alex',
    responseStyle: isUrgent ? 'direct' as const : 'friendly' as const,
    includeBookingLink: false,
  };

  const aiResponse = await generateAIResponse({
    callerPhone: normalizePhone(From),
    config: aiConfig,
    context: 'inbound_sms',
    previousMessages: history,
    incomingMessage: Body,
  });

  // Add delay if configured (simulate human response time)
  const delaySeconds = org.responseDelay || 0;
  if (delaySeconds > 0) {
    await new Promise((r) => setTimeout(r, delaySeconds * 1000));
  }

  // Send reply via TwiML
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Message>${escapeXml(aiResponse.message)}</Message>
</Response>`;

  // Log outbound message
  await prisma.message.create({
    data: {
      organizationId: org.id,
      leadId: lead.id,
      from: normalizePhone(To),
      to: normalizePhone(From),
      body: aiResponse.message,
      direction: 'OUTBOUND',
      aiGenerated: true,
      aiModel: 'gpt-4o-mini',
      status: 'sent',
    },
  });

  return new NextResponse(twiml, {
    headers: { 'Content-Type': 'text/xml' },
  });
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
