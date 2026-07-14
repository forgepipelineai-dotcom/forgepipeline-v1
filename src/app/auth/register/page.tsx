// ForgePipeline AI - Register / Sign Up Page
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Create Account — ForgePipeline AI',
  description: 'Start your free 14-day trial of ForgePipeline AI.',
};

export default function RegisterPage() {
  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="w-8 h-8 rounded bg-green-500 flex items-center justify-center">
            <span className="text-black font-black text-sm">FP</span>
          </div>
          <span className="font-black text-lg tracking-tight">ForgePipeline</span>
          <span className="text-xs text-green-400 font-mono">AI</span>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
          <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-full px-3 py-1 mb-4">
            <span className="text-xs text-green-400 font-medium">14-Day Free Trial · No Credit Card</span>
          </div>
          <h1 className="text-2xl font-black text-white mb-2">Create your account</h1>
          <p className="text-zinc-500 text-sm mb-6">Set up in 10 minutes. Start capturing leads today.</p>

          <form className="space-y-4" action="/api/auth/register" method="POST">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="firstName" className="block text-sm text-zinc-400 mb-1">First name</label>
                <input
                  id="firstName"
                  name="firstName"
                  type="text"
                  required
                  autoComplete="given-name"
                  placeholder="John"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-green-500"
                />
              </div>
              <div>
                <label htmlFor="lastName" className="block text-sm text-zinc-400 mb-1">Last name</label>
                <input
                  id="lastName"
                  name="lastName"
                  type="text"
                  required
                  autoComplete="family-name"
                  placeholder="Doe"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-green-500"
                />
              </div>
            </div>
            <div>
              <label htmlFor="email" className="block text-sm text-zinc-400 mb-1">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@example.com"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-green-500"
              />
            </div>
            <div>
              <label htmlFor="company" className="block text-sm text-zinc-400 mb-1">Business name</label>
              <input
                id="company"
                name="company"
                type="text"
                required
                autoComplete="organization"
                placeholder="Acme Roofing"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-green-500"
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm text-zinc-400 mb-1">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="new-password"
                placeholder="Min. 8 characters"
                minLength={8}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-green-500"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-green-500 hover:bg-green-400 text-black font-bold py-3 rounded-lg text-sm transition"
            >
              Start Free Trial →
            </button>
          </form>

          <p className="text-center text-sm text-zinc-600 mt-6">
            Already have an account?{' '}
            <Link href="/auth/login" className="text-green-400 hover:underline">
              Sign in
            </Link>
          </p>
        </div>

        <p className="text-center text-xs text-zinc-700 mt-6">
          <Link href="/" className="hover:text-zinc-500 transition">← Back to home</Link>
        </p>
      </div>
    </main>
  );
}
