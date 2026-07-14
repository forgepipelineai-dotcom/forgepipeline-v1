// ForgePipeline AI - Leads Page
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { LeadWithActivity } from '@/types';

export default function LeadsPage() {
  const router = useRouter();
  const [leads, setLeads] = useState<LeadWithActivity[]>([]);
  const [loading, setLoading] = useState(true);

  // Auth guard
  useEffect(() => {
    const token = typeof window !== 'undefined'
      ? (localStorage.getItem('fp_session') || sessionStorage.getItem('fp_session'))
      : null;
    if (!token) {
      router.replace('/auth/login');
    }
  }, [router]);

  useEffect(() => {
    fetch('/api/leads?limit=50&sortBy=createdAt&sortOrder=desc')
      .then(r => r.ok ? r.json() : Promise.reject(r.status))
      .then(data => setLeads(data.leads ?? []))
      .catch(() => setLeads([]))
      .finally(() => setLoading(false));
  }, []);

  const statusColor: Record<string, string> = {
    new: 'bg-blue-500/10 text-blue-400 border border-blue-500/20',
    contacted: 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20',
    qualified: 'bg-green-500/10 text-green-400 border border-green-500/20',
    lost: 'bg-red-500/10 text-red-400 border border-red-500/20',
  };

  return (
    <main className="min-h-screen bg-black text-white">
      <nav className="flex items-center justify-between px-8 py-5 border-b border-zinc-900">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded bg-green-500 flex items-center justify-center">
            <span className="text-black font-black text-sm">FP</span>
          </div>
          <span className="font-black text-lg tracking-tight">ForgePipeline</span>
          <span className="text-xs text-green-400 font-mono">AI</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="text-sm text-zinc-400 hover:text-white transition">← Dashboard</Link>
        </div>
      </nav>

      <div className="max-w-6xl mx-auto px-8 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-black">All Leads</h1>
            <p className="text-zinc-500 text-sm mt-1">Every inbound lead captured by ForgePipeline AI</p>
          </div>
          <span className="text-xs text-zinc-600 font-mono">{leads.length} total</span>
        </div>

        {loading ? (
          <div className="text-zinc-600 text-sm">Loading leads…</div>
        ) : leads.length === 0 ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-12 text-center">
            <p className="text-zinc-500 text-sm">No leads yet. Leads appear here after a missed call is detected.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {leads.map((lead) => (
              <div key={lead.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-white">{lead.name ?? 'Unknown Caller'}</p>
                  <p className="text-sm text-zinc-500 mt-0.5">{lead.phone}</p>
                  {lead.jobType && (
                    <p className="text-xs text-zinc-600 mt-0.5">{lead.jobType}</p>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <span className={`text-xs px-2 py-1 rounded-full font-mono ${statusColor[lead.status] ?? 'bg-zinc-800 text-zinc-400'}`}>
                    {lead.status}
                  </span>
                  <span className="text-xs text-zinc-600">
                    {new Date(lead.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
