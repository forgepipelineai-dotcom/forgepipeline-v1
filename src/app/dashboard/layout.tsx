// ForgePipeline AI - Dashboard Layout with proper landmark structure
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  metadataBase: new URL('https://forgepipelineai.com'),
  title: 'Dashboard — ForgePipeline AI',
  description: 'Your ForgePipeline AI command center — leads, pipeline, AI activity.',
  robots: { index: false, follow: false }, // Dashboard is private
};

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-black text-white">
      {/* Skip nav for keyboard/screen reader users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-50 focus:bg-green-500 focus:text-black focus:px-4 focus:py-2 focus:rounded"
      >
        Skip to main content
      </a>

      {/* Site header / primary navigation */}
      <header role="banner" className="border-b border-zinc-900 bg-black sticky top-0 z-40">
        <nav
          role="navigation"
          aria-label="Dashboard navigation"
          className="flex items-center justify-between px-8 py-4 max-w-screen-2xl mx-auto"
        >
          {/* Brand */}
          <Link href="/" aria-label="ForgePipeline AI — go to home page" className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded bg-green-500 flex items-center justify-center"
              aria-hidden="true"
            >
              <span className="text-black font-black text-sm">FP</span>
            </div>
            <span className="font-black text-lg tracking-tight">ForgePipeline</span>
            <span className="text-xs text-green-400 font-mono" aria-hidden="true">AI</span>
          </Link>

          {/* Primary nav links */}
          <ul role="list" className="flex items-center gap-6 list-none m-0 p-0">
            <li>
              <Link
                href="/dashboard"
                className="text-sm text-zinc-400 hover:text-white transition"
                aria-current="page"
              >
                Overview
              </Link>
            </li>
            <li>
              <Link href="/dashboard/leads" className="text-sm text-zinc-400 hover:text-white transition">
                Leads
              </Link>
            </li>
            <li>
              <Link href="/onboarding" className="text-sm text-zinc-400 hover:text-white transition">
                Settings
              </Link>
            </li>
          </ul>
        </nav>
      </header>

      {/* Main content area */}
      <main id="main-content" role="main" aria-label="Dashboard content" className="max-w-screen-2xl mx-auto px-8 py-8">
        {children}
      </main>

      {/* Site footer */}
      <footer role="contentinfo" aria-label="Dashboard footer" className="border-t border-zinc-900 mt-16 py-6 px-8 text-center">
        <p className="text-xs text-zinc-700">
          ForgePipeline AI © {new Date().getFullYear()} — All rights reserved.
        </p>
      </footer>
    </div>
  );
}
