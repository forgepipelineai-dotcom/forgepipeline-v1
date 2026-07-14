// ForgePipeline AI - Stripe Webhook Handler
// Handles subscription lifecycle events

import { NextRequest, NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe/billing';
import { prisma } from '@/lib/db/client';
import Stripe from 'stripe';

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature')!;

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const orgId = session.metadata?.organizationId;
      if (orgId && session.subscription) {
        await prisma.organization.update({
          where: { id: orgId },
          data: {
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: session.subscription as string,
            planStatus: 'ACTIVE',
          },
        });
      }
      break;
    }

    case 'customer.subscription.updated': {
      const sub = event.data.object as Stripe.Subscription;
      const org = await prisma.organization.findFirst({
        where: { stripeSubscriptionId: sub.id },
      });
      if (org) {
        const planId = sub.items.data[0]?.price?.id;
        const planMap: Record<string, any> = {
          [process.env.STRIPE_STARTER_PRICE_ID || '']: 'STARTER',
          [process.env.STRIPE_PRO_PRICE_ID || '']: 'PRO',
          [process.env.STRIPE_AGENCY_PRICE_ID || '']: 'AGENCY',
        };
        await prisma.organization.update({
          where: { id: org.id },
          data: {
            plan: planMap[planId] || org.plan,
            planStatus: sub.status === 'active' ? 'ACTIVE' : sub.status === 'past_due' ? 'PAST_DUE' : 'ACTIVE',
          },
        });
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      await prisma.organization.updateMany({
        where: { stripeSubscriptionId: sub.id },
        data: { planStatus: 'CANCELED' },
      });
      break;
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice;
      await prisma.organization.updateMany({
        where: { stripeCustomerId: invoice.customer as string },
        data: { planStatus: 'PAST_DUE' },
      });
      break;
    }
  }

  return NextResponse.json({ received: true });
}
