// ForgePipeline AI - Stripe Billing
// Subscription management for the SaaS platform

import Stripe from 'stripe';
import type { PricingPlan } from '@/types';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2023-10-16',
});

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: 'starter',
    name: 'Starter',
    price: 297,
    interval: 'month',
    stripePriceId: process.env.STRIPE_STARTER_PRICE_ID || 'price_starter',
    features: [
      'AI missed-call text-back (unlimited)',
      'AI SMS conversation replies',
      '1 business location',
      'Up to 500 contacts',
      'Lead pipeline dashboard',
      'Basic analytics',
      'Email support',
    ],
    limits: {
      locations: 1,
      contacts: 500,
      messagesPerMonth: 1000,
      teamMembers: 2,
    },
  },
  {
    id: 'pro',
    name: 'Pro',
    price: 597,
    interval: 'month',
    stripePriceId: process.env.STRIPE_PRO_PRICE_ID || 'price_pro',
    features: [
      'Everything in Starter',
      'Up to 3 business locations',
      'Up to 2,000 contacts',
      'GoHighLevel integration',
      'Custom AI persona',
      'Automated follow-up sequences',
      'Advanced analytics & reports',
      'Priority support',
    ],
    limits: {
      locations: 3,
      contacts: 2000,
      messagesPerMonth: 5000,
      teamMembers: 5,
    },
  },
  {
    id: 'agency',
    name: 'Agency',
    price: 997,
    interval: 'month',
    stripePriceId: process.env.STRIPE_AGENCY_PRICE_ID || 'price_agency',
    features: [
      'Everything in Pro',
      'Unlimited locations',
      'Unlimited contacts',
      'White-label ready',
      'Sub-account management',
      'API access',
      'Custom integrations',
      'Dedicated account manager',
    ],
    limits: {
      locations: -1,  // unlimited
      contacts: -1,
      messagesPerMonth: -1,
      teamMembers: -1,
    },
  },
];

// Create a Stripe customer
export async function createStripeCustomer(data: {
  email: string;
  name: string;
  organizationId: string;
}) {
  return stripe.customers.create({
    email: data.email,
    name: data.name,
    metadata: { organizationId: data.organizationId },
  });
}

// Create a checkout session for subscription
export async function createCheckoutSession({
  customerId,
  priceId,
  organizationId,
  successUrl,
  cancelUrl,
}: {
  customerId: string;
  priceId: string;
  organizationId: string;
  successUrl: string;
  cancelUrl: string;
}) {
  return stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    mode: 'subscription',
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { organizationId },
    subscription_data: {
      trial_period_days: 14,
      metadata: { organizationId },
    },
    allow_promotion_codes: true,
  });
}

// Create a billing portal session
export async function createBillingPortalSession({
  customerId,
  returnUrl,
}: {
  customerId: string;
  returnUrl: string;
}) {
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
}

// Get subscription status
export async function getSubscriptionStatus(subscriptionId: string) {
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  return {
    status: subscription.status,
    currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
    plan: subscription.items.data[0]?.price?.id,
  };
}
