// ForgePipeline AI - Onboarding / Setup Flow
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Get Started — ForgePipeline AI',
  description: 'Set up ForgePipeline AI in 10 minutes. Connect your phone number and start capturing leads automatically.',
};

const STEPS = [
  {
    num: 1,
    title: 'Create your account',
    desc: 'Enter your business details and choose your plan.',
    done: false,
  },
  {
    num: 2,
    title: 'Connect your phone number',
    desc: 'Link your Twilio number or get a new one from us.',
    done: false,
  },
  {
    num: 3,
    title: 'Configure AI persona',
    desc: 'Set your AI\'s name, tone, and response templates.',
    done: false,
  },
  {
    num: 4,
    title: 'Connect GoHighLevel (optional)',
    desc: 'Sync leads directly to your GHL pipeline.',
    done: false,
  },
];

export default function OnboardingPage() {
  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-lg">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-10">
          <div className="w-8 h-8 rounded bg-green-500 flex items-center justify-center">
            <span className="text-black font-black text-sm">FP</span>
          </div>
          <span className="font-black text-lg tracking-tight">ForgePipeline</span>
          <span className="text-xs text-green-400 font-mono">AI</span>
        </div>

        <div className="text-center mb-8">
          <h1 className="text-3xl font-black text-white mb-2">Let&apos;s get you set up</h1>
          <p className="text-zinc-500">You&apos;re 10 minutes away from never missing a lead again.</p>
        </div>

        {/* Steps */}
        <div className="space-y-3 mb-8">
          {STEPS.map((step) => (
            <div
              key={step.num}
              className="flex items-start gap-4 bg-zinc-900 border border-zinc-800 rounded-xl p-4"
            >
              <div className="w-8 h-8 rounded-full bg-zinc-800 border border-zinc-700 flex items-center justify-center text-sm font-bold text-zinc-400 shrink-0">
                {step.num}
              </div>
              <div>
                <p className="font-bold text-white text-sm">{step.title}</p>
                <p className="text-xs text-zinc-500 mt-0.5">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <Link
          href="/auth/register"
          className="block w-full text-center bg-green-500 hover:bg-green-400 text-black font-bold py-4 rounded-xl text-base transition"
        >
          Create My Account →
        </Link>

        <p className="text-center text-sm text-zinc-600 mt-4">
          Already have an account?{' '}
          <Link href="/auth/login" className="text-green-400 hover:underline">Sign in</Link>
        </p>

        <p className="text-center text-xs text-zinc-700 mt-6">
          <Link href="/" className="hover:text-zinc-500 transition">← Back to home</Link>
        </p>
      </div>
    </main>
  );
}
