// ForgePipeline AI - Login Page
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Login — ForgePipeline AI',
  description: 'Sign in to your ForgePipeline AI account.',
};

export default function LoginPage() {
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
          <h1 className="text-2xl font-black text-white mb-2">Welcome back</h1>
          <p className="text-zinc-500 text-sm mb-6">Sign in to your account to continue.</p>

          <form className="space-y-4" action="/api/auth/callback/credentials" method="POST">
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
              <label htmlFor="password" className="block text-sm text-zinc-400 mb-1">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                placeholder="••••••••"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2.5 text-white text-sm placeholder:text-zinc-600 focus:outline-none focus:border-green-500"
              />
            </div>

            <button
              type="submit"
              className="w-full bg-green-500 hover:bg-green-400 text-black font-bold py-3 rounded-lg text-sm transition"
            >
              Sign In
            </button>
          </form>

          <p className="text-center text-sm text-zinc-600 mt-6">
            Don&apos;t have an account?{' '}
            <Link href="/auth/register" className="text-green-400 hover:underline">
              Start free trial
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
