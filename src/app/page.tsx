// ForgePipeline AI - Landing Page
import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-black text-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-8 py-5 border-b border-zinc-900">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-green-500 flex items-center justify-center">
            <span className="text-black font-black text-sm">FP</span>
          </div>
          <span className="font-black text-lg tracking-tight">ForgePipeline</span>
          <span className="text-xs text-green-400 font-mono">AI</span>
        </div>
        <div className="flex items-center gap-6">
          <Link href="#pricing" className="text-sm text-zinc-400 hover:text-white transition">Pricing</Link>
          <Link href="#features" className="text-sm text-zinc-400 hover:text-white transition">Features</Link>
          <Link href="/auth/login" className="text-sm text-zinc-400 hover:text-white transition">Login</Link>
          <Link
            href="/onboarding"
            className="bg-green-500 hover:bg-green-400 text-black font-bold text-sm px-4 py-2 rounded-lg transition"
          >
            Start Free Trial
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-8 pt-24 pb-20 text-center">
        <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-full px-4 py-1.5 mb-8">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
          <span className="text-xs text-green-400 font-medium tracking-widest uppercase">AI responds in under 60 seconds</span>
        </div>

        <h1 className="text-6xl font-black leading-none tracking-tight mb-6">
          Stop losing jobs to<br />
          <span className="text-green-400">contractors who answer faster.</span>
        </h1>

        <p className="text-xl text-zinc-400 max-w-2xl mx-auto mb-10 leading-relaxed">
          ForgePipeline AI instantly texts back every missed call, qualifies leads automatically, and books jobs — 24/7, without you lifting a finger.
        </p>

        <div className="flex items-center justify-center gap-4">
          <Link
            href="/onboarding"
            className="bg-green-500 hover:bg-green-400 text-black font-black text-lg px-8 py-4 rounded-xl transition"
          >
            Start 14-Day Free Trial
          </Link>
          <Link
            href="#demo"
            className="border border-zinc-700 hover:border-zinc-500 text-white font-medium text-lg px-8 py-4 rounded-xl transition"
          >
            Watch Demo →
          </Link>
        </div>

        <p className="text-sm text-zinc-600 mt-4">No credit card required · Setup in 10 minutes</p>
      </section>

      {/* Stats Bar */}
      <section className="border-y border-zinc-900 py-8 bg-zinc-950">
        <div className="max-w-4xl mx-auto grid grid-cols-4 gap-8 text-center">
          {[
            { value: '<60s', label: 'AI response time' },
            { value: '3x', label: 'More jobs booked' },
            { value: '97%', label: 'Leads contacted' },
            { value: '$0', label: 'Extra staff needed' },
          ].map((stat) => (
            <div key={stat.label}>
              <p className="text-3xl font-black text-green-400">{stat.value}</p>
              <p className="text-sm text-zinc-500 mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it Works */}
      <section id="features" className="max-w-5xl mx-auto px-8 py-20">
        <h2 className="text-4xl font-black text-center mb-4">How ForgePipeline Works</h2>
        <p className="text-zinc-400 text-center mb-12">Set it up once. Watch it run your pipeline.</p>

        <div className="grid grid-cols-4 gap-4">
          {[
            {
              num: '01',
              title: 'Missed call hits',
              desc: 'Customer calls your business number. You miss it.',
            },
            {
              num: '02',
              title: 'AI texts in 60s',
              desc: 'ForgePipeline instantly sends a personalized text-back from your business.',
            },
            {
              num: '03',
              title: 'Lead is qualified',
              desc: 'AI converses with the prospect, collects job details, and scores the lead.',
            },
            {
              num: '04',
              title: 'Job gets booked',
              desc: 'Appointment booked, added to your CRM, synced to GoHighLevel. You show up.',
            },
          ].map((step) => (
            <div key={step.num} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
              <div className="text-green-400 font-mono text-xs mb-3">{step.num}</div>
              <h3 className="font-bold text-white mb-2">{step.title}</h3>
              <p className="text-sm text-zinc-500 leading-relaxed">{step.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-5xl mx-auto px-8 py-20">
        <h2 className="text-4xl font-black text-center mb-4">Simple, Honest Pricing</h2>
        <p className="text-zinc-400 text-center mb-12">One missed job pays for the whole month.</p>

        <div className="grid grid-cols-3 gap-6">
          {[
            {
              name: 'Starter',
              price: '$297',
              desc: 'Perfect for solo contractors',
              features: ['AI missed-call text-back', 'AI SMS conversations', '1 location', '500 contacts', 'Lead pipeline dashboard'],
              cta: 'Start Free Trial',
              highlight: false,
            },
            {
              name: 'Pro',
              price: '$597',
              desc: 'For growing businesses',
              features: ['Everything in Starter', 'GoHighLevel sync', 'Up to 3 locations', '2,000 contacts', 'Custom AI persona', 'Follow-up sequences'],
              cta: 'Start Free Trial',
              highlight: true,
            },
            {
              name: 'Agency',
              price: '$997',
              desc: 'Run it for your clients',
              features: ['Everything in Pro', 'Unlimited locations', 'White-label ready', 'API access', 'Sub-accounts', 'Account manager'],
              cta: 'Start Free Trial',
              highlight: false,
            },
          ].map((plan) => (
            <div
              key={plan.name}
              className={`rounded-xl p-6 border ${
                plan.highlight
                  ? 'bg-green-500/5 border-green-500/30'
                  : 'bg-zinc-900 border-zinc-800'
              }`}
            >
              {plan.highlight && (
                <div className="text-xs text-green-400 font-medium tracking-widest uppercase mb-3">Most Popular</div>
              )}
              <h3 className="text-xl font-black text-white">{plan.name}</h3>
              <p className="text-3xl font-black text-white mt-2">
                {plan.price}
                <span className="text-sm font-normal text-zinc-500">/mo</span>
              </p>
              <p className="text-sm text-zinc-500 mt-1 mb-5">{plan.desc}</p>
              <ul className="space-y-2 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-zinc-400">
                    <span className="text-green-400">✓</span> {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/onboarding"
                className={`block w-full text-center py-3 rounded-lg font-bold text-sm transition ${
                  plan.highlight
                    ? 'bg-green-500 hover:bg-green-400 text-black'
                    : 'border border-zinc-700 hover:border-zinc-500 text-white'
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-zinc-900 py-8 text-center">
        <p className="text-zinc-600 text-sm">
          © 2025 ForgePipeline AI · Built by{' '}
          <a href="https://forgepipeline.com" className="text-green-400 hover:underline">
            ForgePipeline
          </a>
        </p>
      </footer>
    </main>
  );
}
