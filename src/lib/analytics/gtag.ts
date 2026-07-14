// ForgePipeline AI — GA4 / GTM event utility
// Usage: import { trackEvent } from '@/lib/analytics/gtag'

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

/** Fire a GA4 custom event (also picked up by GTM via dataLayer) */
export function trackEvent(
  eventName: string,
  params: Record<string, string | number | boolean> = {},
) {
  if (typeof window === 'undefined') return;

  // Push to dataLayer (GTM)
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push({ event: eventName, ...params });

  // Also send via gtag if available
  if (typeof window.gtag === 'function') {
    window.gtag('event', eventName, params);
  }
}

/** Predefined events — call these from component onClick handlers */
export const analytics = {
  /** Primary CTA — "Start 14-Day Free Trial" */
  ctaPrimaryClick: (location: string) =>
    trackEvent('cta_click', { cta_name: 'start_free_trial', cta_location: location }),

  /** Secondary CTA — "Watch Demo →" */
  ctaSecondaryClick: (location: string) =>
    trackEvent('cta_click', { cta_name: 'watch_demo', cta_location: location }),

  /** Demo booking click */
  demoBookingClick: () =>
    trackEvent('demo_booking_click', { destination: 'calendar' }),

  /** Phone number click */
  phoneClick: (phone: string) =>
    trackEvent('phone_click', { phone_number: phone }),

  /** Email link click */
  emailClick: (email: string) =>
    trackEvent('email_click', { email_address: email }),

  /** Form submission */
  formSubmit: (formId: string, success: boolean) =>
    trackEvent('form_submit', { form_id: formId, success }),

  /** Page section viewed (Intersection Observer) */
  sectionView: (sectionId: string) =>
    trackEvent('section_view', { section_id: sectionId }),

  /** Pricing plan selected */
  pricingPlanClick: (planName: string, price: number) =>
    trackEvent('pricing_plan_click', { plan_name: planName, price_usd: price }),

  /** Login form submitted */
  loginAttempt: () =>
    trackEvent('login_attempt', {}),

  /** Registration completed */
  registrationComplete: () =>
    trackEvent('sign_up', { method: 'email' }),

  /** Onboarding step completed */
  onboardingStep: (step: number, stepName: string) =>
    trackEvent('onboarding_step', { step_number: step, step_name: stepName }),

  /** Trial started */
  trialStarted: (plan: string) =>
    trackEvent('trial_started', { plan_name: plan }),
};
