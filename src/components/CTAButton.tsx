'use client';
// ForgePipeline AI — Tracked CTA button
// Wraps Link with GA4/GTM event firing on click

import Link from 'next/link';
import { analytics } from '@/lib/analytics/gtag';

interface CTAButtonProps {
  href: string;
  children: React.ReactNode;
  className?: string;
  variant?: 'primary' | 'secondary' | 'demo';
  location?: string;
  onClick?: () => void;
}

export function CTAButton({
  href,
  children,
  className = '',
  variant = 'primary',
  location = 'page',
  onClick,
}: CTAButtonProps) {
  const handleClick = () => {
    if (variant === 'primary') analytics.ctaPrimaryClick(location);
    else if (variant === 'secondary' || variant === 'demo') analytics.ctaSecondaryClick(location);
    onClick?.();
  };

  return (
    <Link href={href} className={className} onClick={handleClick}>
      {children}
    </Link>
  );
}

/** Tracked phone link */
export function PhoneLink({
  phone,
  children,
  className = '',
}: {
  phone: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a href={`tel:${phone}`} className={className} onClick={() => analytics.phoneClick(phone)}>
      {children}
    </a>
  );
}

/** Tracked email link */
export function EmailLink({
  email,
  children,
  className = '',
}: {
  email: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a
      href={`mailto:${email}`}
      className={className}
      onClick={() => analytics.emailClick(email)}
    >
      {children}
    </a>
  );
}
