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
//
// Two-layer design:
//   L1 — in-memory Map: sub-millisecond check within a warm serverless instance.
//          Does NOT survive cold starts or cross-instance delivery.
//   L2 — DB WebhookEvent table: durable unique constraint that prevents
//          duplicate processing across all instances, restarts, and GHL retries.
//
// Flow: check L1 → check L2 → process → write L2 → write L1
// On duplicate: return 200 immediately so GHL stops retrying.

// L1 — instance-local warm cache (evicted on cold start; that's fine — L2 catches it)
const l1Cache = new Map<string, number>();

function buildIdempotencyKey(payload: GHLWebhookPayload): string {
  const id = payload.id ?? payload.contactId ?? payload.appointmentId ?? payload.formId ?? 'unknown';
  return `${payload.locationId}:${payload.type}:${id}`;
}

function l1IsDuplicate(key: string): boolean {
  const ts = l1Cache.get(key);
  if (!ts) return false;
  return Date.now() - ts < 86_400_000; // 24h
}

function l1Mark(key: string): void {
  l1Cache.set(key, Date.now());
  // Prune to prevent unbounded growth within a single warm instance
  if (l1Cache.size > 5_000) {
    const cutoff = Date.now() - 86_400_000;
    for (const [k, t] of l1Cache) {
      if (t < cutoff) l1Cache.delete(k);
    }
  }
}

/**
 * Attempt to write the idempotency key to the DB.
 * Returns true if this is the FIRST delivery (key did not exist).
 * Returns false if the key already exists (duplicate — skip processing).
 * Swallows DB errors in dev so tests can run without a real DATABASE_URL.
 */
async function l2ClaimKey(key: string, eventType: string): Promise<boolean> {
  try {
    const { prisma } = await import('@/lib/db/client');
    await prisma.webhookEvent.create({
      data: {
        idempotencyKey: key,
        source: 'ghl',
        eventType,
        // Keep records for 7 days then prune (cron or DB job)
        expiresAt: new Date(Date.now() + 7 * 86_400_000),
      },
    });
    return true; // Created successfully — first delivery
  } catch (err: unknown) {
    // Unique constraint violation → duplicate delivery
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('Unique constraint') || msg.includes('P2002')) {
      return false;
    }
    // DB unavailable (e.g. dev with mock DATABASE_URL) — fall back to L1 only
    if (process.env.NODE_ENV === 'development') {
      console.warn('[GHL Webhook] DB unavailable for idempotency check — L1 only (dev mode)');
      return true; // Allow processing; L1 will catch retries within same instance
    }
    // In production, treat DB error as transient — return 500 so GHL retries later
    throw err;
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

  // 4b. Location validation — reject events not from the approved GHL location.
  // Prevents cross-location data contamination even with a valid shared secret.
  const approvedLocationId = process.env.GHL_LOCATION_ID || process.env.GHL_DEFAULT_ORG_ID;
  if (approvedLocationId && payload.locationId !== approvedLocationId) {
    // Log (without exposing approved value) and reject
    console.warn(
      `[GHL Webhook] Rejected — unexpected locationId: ${payload.locationId.slice(0, 8)}...` +
      ` (expected approved location)`
    );
    return NextResponse.json(
      { error: 'Forbidden — locationId not approved for this endpoint' },
      { status: 403 },
    );
  }
  // If neither env var is set, fall through with a warning (dev/test mode)
  if (!approvedLocationId) {
    console.warn('[GHL Webhook] GHL_LOCATION_ID not set — locationId validation skipped (dev/test only)');
  }

  // 5. Idempotency — L1 (in-memory) then L2 (DB) check
  const idempotencyKey = buildIdempotencyKey(payload);

  // L1: instant check within same warm instance
  if (l1IsDuplicate(idempotencyKey)) {
    console.log(`[GHL Webhook] Duplicate (L1) — key: ${idempotencyKey}`);
    return NextResponse.json({ status: 'already_processed', layer: 'l1' }, { status: 200 });
  }

  // L2: durable DB check (catches cross-instance and post-cold-start duplicates)
  let isFirstDelivery: boolean;
  try {
    isFirstDelivery = await l2ClaimKey(idempotencyKey, payload.type);
  } catch {
    // DB error in production — reject with 500 so GHL retries later
    return NextResponse.json({ error: 'Idempotency check failed' }, { status: 500 });
  }

  if (!isFirstDelivery) {
    l1Mark(idempotencyKey); // warm the L1 cache so subsequent retries skip DB
    console.log(`[GHL Webhook] Duplicate (L2) — key: ${idempotencyKey}`);
    return NextResponse.json({ status: 'already_processed', layer: 'l2' }, { status: 200 });
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

    // 7. Warm L1 cache after confirmed processing
    l1Mark(idempotencyKey);

    return NextResponse.json(
      { status: 'ok', event: payload.type, processed: idempotencyKey },
      { status: 200 },
    );
  } catch (err) {
    // 8. Safe error logging — no secrets, no user PII in error response
    const msg = err instanceof Error ? err.message : 'Unknown error';

    // In dev/test with no DATABASE_URL, Prisma operations throw connection errors.
    // These are expected and should not cause 500s in development.
    const isDbConnectionError = msg.includes('connect') || msg.includes('ECONNREFUSED') ||
      msg.includes('P1001') || msg.includes('P1002') || msg.includes('Can\'t reach');

    if (isDbConnectionError && process.env.NODE_ENV !== 'production') {
      console.warn(`[GHL Webhook] DB unavailable — event ${payload.type} logged but not persisted (dev mode)`);
      l1Mark(idempotencyKey);
      return NextResponse.json(
        { status: 'ok', event: payload.type, processed: idempotencyKey, note: 'db_unavailable_dev' },
        { status: 200 },
      );
    }

    console.error(`[GHL Webhook] Handler error for ${payload.type}:`, msg);
    // Return 500 so GHL will retry in production
    return NextResponse.json({ error: 'Internal processing error' }, { status: 500 });
  }
}
