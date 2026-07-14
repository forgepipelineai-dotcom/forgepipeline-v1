// ForgePipeline AI - Single Lead API (GET, PATCH, DELETE)
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerComponentClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const dbUser = await prisma.user.findUnique({ where: { supabaseId: user.id } });
  if (!dbUser) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const lead = await prisma.lead.findFirst({
    where: { id: params.id, organizationId: dbUser.organizationId },
    include: {
      messages: { orderBy: { sentAt: 'asc' } },
      calls: { orderBy: { occurredAt: 'desc' } },
      activities: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  });

  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
  return NextResponse.json({ lead });
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerComponentClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const dbUser = await prisma.user.findUnique({ where: { supabaseId: user.id } });
  if (!dbUser) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const body = await req.json();
  const lead = await prisma.lead.findFirst({
    where: { id: params.id, organizationId: dbUser.organizationId },
  });
  if (!lead) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });

  const updatedLead = await prisma.lead.update({
    where: { id: params.id },
    data: body,
  });

  // Log status changes
  if (body.status && body.status !== lead.status) {
    await prisma.leadActivity.create({
      data: {
        leadId: lead.id,
        type: 'status_change',
        description: `Status changed from ${lead.status} to ${body.status}`,
      },
    });
  }

  return NextResponse.json({ lead: updatedLead });
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createServerComponentClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const dbUser = await prisma.user.findUnique({ where: { supabaseId: user.id } });
  if (!dbUser) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await prisma.lead.deleteMany({
    where: { id: params.id, organizationId: dbUser.organizationId },
  });

  return NextResponse.json({ ok: true });
}
