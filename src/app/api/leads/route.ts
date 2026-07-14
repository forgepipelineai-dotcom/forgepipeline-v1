// ForgePipeline AI - Leads API
// CRUD for leads + AI scoring + GHL sync

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { scoreLeadQuality } from '@/lib/ai/respond';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { z } from 'zod';

const createLeadSchema = z.object({
  name: z.string().optional(),
  phone: z.string().min(10),
  email: z.string().email().optional(),
  source: z.enum(['MISSED_CALL', 'INBOUND_SMS', 'WEB_FORM', 'MANUAL', 'IMPORT']).default('MANUAL'),
  jobType: z.string().optional(),
  jobDescription: z.string().optional(),
  estimatedValue: z.number().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const updateLeadSchema = z.object({
  status: z.string().optional(),
  stage: z.string().optional(),
  priority: z.string().optional(),
  name: z.string().optional(),
  email: z.string().email().optional(),
  jobType: z.string().optional(),
  jobDescription: z.string().optional(),
  estimatedValue: z.number().optional(),
  notes: z.string().optional(),
  assignedTo: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

// GET /api/leads - list leads for org
export async function GET(req: NextRequest) {
  const supabase = createServerComponentClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const dbUser = await prisma.user.findUnique({
    where: { supabaseId: user.id },
    include: { organization: true },
  });
  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const stage = searchParams.get('stage');
  const source = searchParams.get('source');
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '25');
  const search = searchParams.get('search');
  const sortBy = searchParams.get('sortBy') || 'createdAt';
  const sortOrder = (searchParams.get('sortOrder') || 'desc') as 'asc' | 'desc';

  const where: any = { organizationId: dbUser.organizationId };
  if (status) where.status = status;
  if (stage) where.stage = stage;
  if (source) where.source = source;
  if (search) {
    where.OR = [
      { name: { contains: search, mode: 'insensitive' } },
      { phone: { contains: search } },
      { email: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [leads, total] = await Promise.all([
    prisma.lead.findMany({
      where,
      include: {
        messages: { orderBy: { sentAt: 'desc' }, take: 1 },
        calls: { orderBy: { occurredAt: 'desc' }, take: 1 },
        _count: { select: { messages: true, calls: true } },
      },
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.lead.count({ where }),
  ]);

  return NextResponse.json({
    leads,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  });
}

// POST /api/leads - create lead
export async function POST(req: NextRequest) {
  const supabase = createServerComponentClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const dbUser = await prisma.user.findUnique({
    where: { supabaseId: user.id },
    include: { organization: true },
  });
  if (!dbUser) return NextResponse.json({ error: 'User not found' }, { status: 404 });

  const body = await req.json();
  const parsed = createLeadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors }, { status: 400 });
  }

  const lead = await prisma.lead.create({
    data: {
      ...parsed.data,
      organizationId: dbUser.organizationId,
      status: 'NEW',
      stage: 'new',
    },
  });

  // Log creation activity
  await prisma.leadActivity.create({
    data: {
      leadId: lead.id,
      type: 'note',
      description: `Lead created manually`,
    },
  });

  // Track analytics
  await prisma.analyticsEvent.create({
    data: {
      organizationId: dbUser.organizationId,
      event: 'lead.created',
      properties: { source: lead.source, leadId: lead.id },
    },
  });

  return NextResponse.json({ lead }, { status: 201 });
}
