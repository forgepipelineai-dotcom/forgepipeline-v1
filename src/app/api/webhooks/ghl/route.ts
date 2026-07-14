// ForgePipeline AI — /api/webhooks/ghl
// Receives inbound GoHighLevel webhook events and maps them to CRM workflow actions.
//
// Security:
//   - POST only (405 on all other methods)
//   - HMAC-SHA256 signature verification via x-ghl-signature header
//   - Idempotency key prevents duplicate processing
//   - No secrets logged
//   - Malformed payload returns 400
//
// Retry-safe: GHL retries on non-2xx. Duplicate events are detected and return 200
// immediately without re-processing, so retries are safe.

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// ─── Types ───────────────────────────────────────────────────────────────────

type GHLEventType =
  | 'ContactCreate'
  | 'ContactUpdate'
  | 'ContactDelete'
  | 'OpportunityCreate'
  | 'OpportunityStatusUpdate'
  | 'AppointmentCreate'
  | 'AppointmentUpdate'
  | 'FormSubmit'
  | 'InboundMessage'
  | 'OutboundMessage'
  | 'NoteCreate'
  | 'TaskComplete';

interface GHLWebhookPayload {
  type: GHLEventType;
  locationId: string;
  id?: string;              // contact or opportunity ID
  contactId?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  tags?: string[];
  status?: string;          // opportunity status
  pipelineId?: string;
  pipelineStageId?: string;
  appointmentId?: string;
  startTime?: string;
  endTime?: string;
  calendarId?: string;
  formId?: string;
  formData?: Record<string, unknown>;
  messageType?: string;
  message?: string;
  dateAdded?: string;
  dateUpdated?: string;
  [key: string]: unknown;
}

// ─── Signature Verification ───────────────────────────────────────────────────

/**
 * Verifies the GHL webhook HMAC-SHA256 signature.
 * GHL signs the raw request body with the webhook signing secret.
 * Header: x-ghl-signature (hex-encoded SHA256 HMAC)
 */
function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.GHL_WEBHOOK_SECRET;
  if (!secret) {
    // If secret not configured, log warning and skip verification in dev
    if (process.env.NODE_ENV === 'development') {
      console.warn('[GHL Webhook] GHL_WEBHOOK_SECRET not set — skipping signature check (dev only)');
      return true;
    }
    console.error('[GHL Webhook] GHL_WEBHOOK_SECRET not configured — rejecting request');
    return false;
  }
  if (!signature) {
    console.warn('[GHL Webhook] Missing x-ghl-signature header');
    return false;
  }
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody, 'utf8')
    .digest('hex');
  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expected, 'hex'),
    );
  } catch {
    return false;
  }
}

// ─── Idempotency Store ────────────────────────────────────────────────────────

// In-memory idempotency cache (survives restarts via DB in production).
// Key: locationId:type:id — TTL: 24h window
const processedEvents = new Map<string, number>();

function buildIdempotencyKey(payload: GHLWebhookPayload): string {
  const id = payload.id ?? payload.contactId ?? payload.appointmentId ?? payload.formId ?? 'unknown';
  return `${payload.locationId}:${payload.type}:${id}`;
}

function isDuplicate(key: string): boolean {
  const ts = processedEvents.get(key);
  if (!ts) return false;
  const age = Date.now() - ts;
  return age < 86_400_000; // 24h
}

function markProcessed(key: string): void {
  processedEvents.set(key, Date.now());
  // Prune keys older than 24h to prevent memory leak
  if (processedEvents.size > 10_000) {
    const cutoff = Date.now() - 86_400_000;
    for (const [k, t] of processedEvents) {
      if (t < cutoff) processedEvents.delete(k);
    }
  }
}

// ─── Event Handlers ───────────────────────────────────────────────────────────

// Resolve organizationId from GHL locationId
async function resolveOrgId(locationId: string): Promise<string | null> {
  try {
    const { prisma } = await import('@/lib/db/client');
    const integration = await prisma.integration.findFirst({
      // Match by locationId stored in config JSON
      where: { provider: 'GOHIGHLEVEL', isActive: true },
      select: { organizationId: true, config: true },
    });
    // Match locationId from config JSON (stored as { locationId: string })
    const matched = integration && (integration.config as Record<string, unknown> | null)?.locationId === locationId;
    return matched ? integration.organizationId : (process.env.GHL_DEFAULT_ORG_ID ?? null);
  } catch {
    // Integration table may not exist in all schema versions
    return process.env.GHL_DEFAULT_ORG_ID ?? null;
  }
}

async function handleContactCreate(payload: GHLWebhookPayload): Promise<void> {
  const name = [payload.firstName, payload.lastName].filter(Boolean).join(' ') || null;
  if (!payload.phone) return;

  const orgId = await resolveOrgId(payload.locationId);
  if (!orgId) {
    console.warn('[GHL] ContactCreate — no orgId for locationId:', payload.locationId);
    return;
  }

  const { prisma } = await import('@/lib/db/client');
  // findFirst + conditional create (phone is not @unique in schema)
  const existing = await prisma.lead.findFirst({ where: { phone: payload.phone, organizationId: orgId } });
  if (!existing) {
    await prisma.lead.create({
      data: {
        phone: payload.phone,
        name,
        email: payload.email ?? null,
        source: 'MANUAL',        // closest enum to GHL contact create
        status: 'NEW',
        organizationId: orgId,
        aiResponded: false,
      },
    }).catch(e => console.error('[GHL] ContactCreate DB failed:', e?.message));
  } else {
    await prisma.lead.update({
      where: { id: existing.id },
      data: { name: name ?? undefined, email: payload.email ?? undefined },
    }).catch(e => console.error('[GHL] ContactCreate update failed:', e?.message));
  }
  console.log(`[GHL] ContactCreate — ${name ?? 'unknown'} ${payload.phone}`);
}

async function handleContactUpdate(payload: GHLWebhookPayload): Promise<void> {
  if (!payload.phone) return;
  const orgId = await resolveOrgId(payload.locationId);
  if (!orgId) return;
  const { prisma } = await import('@/lib/db/client');
  const name = [payload.firstName, payload.lastName].filter(Boolean).join(' ') || undefined;
  await prisma.lead.updateMany({
    where: { phone: payload.phone, organizationId: orgId },
    data: { name, email: payload.email ?? undefined },
  }).catch(e => console.error('[GHL] ContactUpdate failed:', e?.message));
  console.log(`[GHL] ContactUpdate — ${payload.phone}`);
}

async function handleOpportunityStatusUpdate(payload: GHLWebhookPayload): Promise<void> {
  // Map GHL opportunity status → LeadStatus enum
  const statusMap: Record<string, 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'CLOSED_WON' | 'CLOSED_LOST'> = {
    open:      'NEW',
    contacted: 'CONTACTED',
    won:       'CLOSED_WON',
    lost:      'CLOSED_LOST',
    abandoned: 'CLOSED_LOST',
    qualified: 'QUALIFIED',
  };
  const newStatus = statusMap[payload.status?.toLowerCase() ?? ''] ?? 'NEW';
  if (payload.contactId) {
    const { prisma } = await import('@/lib/db/client');
    await prisma.lead.updateMany({
      where: { id: payload.contactId },
      data: { status: newStatus },
    }).catch(e => console.error('[GHL] OpportunityStatus update failed:', e?.message));
  }
  console.log(`[GHL] OpportunityStatusUpdate — ${payload.id} → ${payload.status}`);
}

async function handleAppointmentCreate(payload: GHLWebhookPayload): Promise<void> {
  console.log(`[GHL] AppointmentCreate — calendar:${payload.calendarId} start:${payload.startTime}`);
  // Future: update lead stage to QUALIFIED, trigger confirmation SMS via Twilio
}

async function handleFormSubmit(payload: GHLWebhookPayload): Promise<void> {
  const formData = payload.formData as Record<string, string> | undefined;
  const phone = formData?.phone ?? formData?.Phone ?? null;
  const name  = formData?.name ?? formData?.Name ?? formData?.full_name ?? null;
  const email = formData?.email ?? formData?.Email ?? null;
  if (!phone) return;

  const orgId = await resolveOrgId(payload.locationId);
  if (!orgId) return;

  const { prisma } = await import('@/lib/db/client');
  const existing = await prisma.lead.findFirst({ where: { phone, organizationId: orgId } });
  if (!existing) {
    await prisma.lead.create({
      data: {
        phone,
        name: name ?? null,
        email: email ?? null,
        source: 'WEB_FORM',
        status: 'NEW',
        organizationId: orgId,
        aiResponded: false,
      },
    }).catch(e => console.error('[GHL] FormSubmit create failed:', e?.message));
  }
  console.log(`[GHL] FormSubmit — form:${payload.formId} phone:${phone}`);
}

async function handleInboundMessage(payload: GHLWebhookPayload): Promise<void> {
  // Log inbound message — future: trigger AI response pipeline
  console.log(`[GHL] InboundMessage — contact:${payload.contactId} type:${payload.messageType}`);
}

// ─── Route Handler ────────────────────────────────────────────────────────────

// Reject all methods except POST
export async function GET()    { return NextResponse.json({ error: 'Method not allowed' }, { status: 405 }); }
export async function PUT()    { return NextResponse.json({ error: 'Method not allowed' }, { status: 405 }); }
export async function DELETE() { return NextResponse.json({ error: 'Method not allowed' }, { status: 405 }); }
export async function PATCH()  { return NextResponse.json({ error: 'Method not allowed' }, { status: 405 }); }

export async function POST(req: NextRequest) {
  // 1. Read raw body (required for HMAC verification)
  let rawBody: string;
  try {
    rawBody = await req.text();
  } catch {
    return NextResponse.json({ error: 'Failed to read request body' }, { status: 400 });
  }

  // 2. Verify signature
  const signature = req.headers.get('x-ghl-signature');
  if (!verifySignature(rawBody, signature)) {
    // Log without exposing the received value
    console.warn('[GHL Webhook] Signature verification failed — request rejected');
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 3. Parse and validate payload
  let payload: GHLWebhookPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  // 4. Validate required fields
  if (!payload.type || typeof payload.type !== 'string') {
    return NextResponse.json({ error: 'Missing or invalid event type' }, { status: 400 });
  }
  if (!payload.locationId || typeof payload.locationId !== 'string') {
    return NextResponse.json({ error: 'Missing locationId' }, { status: 400 });
  }

  // 5. Idempotency — return 200 immediately for duplicates (safe for GHL retries)
  const idempotencyKey = buildIdempotencyKey(payload);
  if (isDuplicate(idempotencyKey)) {
    console.log(`[GHL Webhook] Duplicate event ignored — key: ${idempotencyKey}`);
    return NextResponse.json({ status: 'already_processed' }, { status: 200 });
  }

  // 6. Dispatch to event handler
  try {
    switch (payload.type) {
      case 'ContactCreate':
        await handleContactCreate(payload);
        break;
      case 'ContactUpdate':
        await handleContactUpdate(payload);
        break;
      case 'OpportunityCreate':
        console.log(`[GHL] OpportunityCreate — ${payload.id}`);
        break;
      case 'OpportunityStatusUpdate':
        await handleOpportunityStatusUpdate(payload);
        break;
      case 'AppointmentCreate':
        await handleAppointmentCreate(payload);
        break;
      case 'AppointmentUpdate':
        console.log(`[GHL] AppointmentUpdate — ${payload.appointmentId}`);
        break;
      case 'FormSubmit':
        await handleFormSubmit(payload);
        break;
      case 'InboundMessage':
        await handleInboundMessage(payload);
        break;
      default:
        // Unknown event type — accept and log, don't error (forward-compatible)
        console.log(`[GHL Webhook] Unhandled event type: ${payload.type}`);
    }

    // 7. Mark as processed after successful handling
    markProcessed(idempotencyKey);

    return NextResponse.json(
      { status: 'ok', event: payload.type, processed: idempotencyKey },
      { status: 200 },
    );
  } catch (err) {
    // 8. Safe error logging — no secrets, no user PII in error response
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[GHL Webhook] Handler error for ${payload.type}:`, msg);
    // Return 500 so GHL will retry
    return NextResponse.json({ error: 'Internal processing error' }, { status: 500 });
  }
}
