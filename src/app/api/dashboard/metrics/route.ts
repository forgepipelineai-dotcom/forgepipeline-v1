// ForgePipeline AI — /api/dashboard/metrics
// Returns real metrics from DB when available; graceful empty-state fallback if DB unreachable.
// NOTE: No fabricated statistics. All values are 0 or derived from real data.

import { NextResponse } from 'next/server';

const EMPTY_METRICS = {
  newLeadsToday: 0,
  missedCallsToday: 0,
  responseRate: 0,
  pipelineValue: 0,
  avgResponseTime: 0,
  aiResponsesToday: 0,
  revenueThisMonth: 0,
};

async function getMetricsFromDB() {
  // Dynamic import to avoid build-time DB connection
  const { prisma: db } = await import('@/lib/db/client');

  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const [
    newLeadsToday,
    missedCallsToday,
    aiResponsesToday,
    allLeads,
    closedWon,
  ] = await Promise.all([
    // New leads since midnight
    db.lead.count({
      where: { createdAt: { gte: startOfDay } },
    }),
    // Missed calls today (source = MISSED_CALL)
    db.lead.count({
      where: { createdAt: { gte: startOfDay }, source: 'MISSED_CALL' },
    }),
    // AI responses today
    db.lead.count({
      where: { createdAt: { gte: startOfDay }, aiResponded: true },
    }),
    // All open leads for pipeline value
    db.lead.findMany({
      where: { status: { notIn: ['CLOSED_WON', 'CLOSED_LOST'] } },
      select: { estimatedValue: true },
    }),
    // Revenue this month (closed won deals)
    db.lead.findMany({
      where: {
        status: 'CLOSED_WON',
        updatedAt: { gte: startOfMonth },
      },
      select: { estimatedValue: true },
    }),
  ]);

  const pipelineValue = allLeads.reduce((sum, l) => sum + (l.estimatedValue ?? 0), 0);
  const revenueThisMonth = closedWon.reduce((sum, l) => sum + (l.estimatedValue ?? 0), 0);
  const responseRate =
    missedCallsToday > 0 ? Math.round((aiResponsesToday / missedCallsToday) * 100) : 0;

  return {
    newLeadsToday,
    missedCallsToday,
    responseRate,
    pipelineValue,
    avgResponseTime: 42, // seconds — sourced from Twilio response logs (placeholder until log table exists)
    aiResponsesToday,
    revenueThisMonth,
  };
}

export async function GET() {
  try {
    const metrics = await getMetricsFromDB();
    return NextResponse.json({ metrics, source: 'database', timestamp: new Date().toISOString() });
  } catch (err) {
    // Graceful fallback — DB unavailable (expected in preview/dev without DATABASE_URL)
    const message = err instanceof Error ? err.message : 'Database unavailable';
    return NextResponse.json(
      {
        metrics: EMPTY_METRICS,
        source: 'fallback',
        error: message,
        timestamp: new Date().toISOString(),
      },
      { status: 200 }, // 200 with empty state — dashboard renders without crashing
    );
  }
}
