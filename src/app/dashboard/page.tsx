// ForgePipeline AI - Main Dashboard
'use client';

import { useEffect, useState } from 'react';
import type { DashboardMetrics, LeadWithActivity } from '@/types';

// Metric Card Component
function MetricCard({
  title,
  value,
  subtitle,
  trend,
  color = 'green',
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: string;
  color?: 'green' | 'white' | 'red' | 'yellow';
}) {
  const colorMap = {
    green: 'text-green-400',
    white: 'text-white',
    red: 'text-red-400',
    yellow: 'text-yellow-400',
  };
  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
      <p className="text-xs text-zinc-500 uppercase tracking-widest mb-1">{title}</p>
      <p className={`text-3xl font-black ${colorMap[color]}`}>{value}</p>
      {subtitle && <p className="text-xs text-zinc-600 mt-1">{subtitle}</p>}
      {trend && <p className="text-xs text-green-500 mt-1">{trend}</p>}
    </div>
  );
}

// Recent Lead Row
function LeadRow({ lead }: { lead: LeadWithActivity }) {
  const statusColors: Record<string, string> = {
    NEW: 'bg-blue-500/20 text-blue-400',
    CONTACTED: 'bg-yellow-500/20 text-yellow-400',
    QUALIFIED: 'bg-purple-500/20 text-purple-400',
    CLOSED_WON: 'bg-green-500/20 text-green-400',
    CLOSED_LOST: 'bg-red-500/20 text-red-400',
  };
  return (
    <div className="flex items-center justify-between py-3 border-b border-zinc-800 last:border-0">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 text-xs font-bold">
          {lead.name?.[0] || lead.phone.slice(-2)}
        </div>
        <div>
          <p className="text-sm font-medium text-white">{lead.name || lead.phone}</p>
          <p className="text-xs text-zinc-500">{lead.source.replace('_', ' ')} · {lead.jobType || 'General inquiry'}</p>
        </div>
      </div>
      <div className="flex items-center gap-3">
        {lead.aiResponded && (
          <span className="text-xs bg-green-500/10 text-green-400 border border-green-500/20 rounded px-2 py-0.5">
            AI ✓
          </span>
        )}
        <span className={`text-xs rounded-full px-2 py-0.5 ${statusColors[lead.status] || 'bg-zinc-700 text-zinc-400'}`}>
          {lead.status}
        </span>
        {lead.estimatedValue && (
          <span className="text-sm font-bold text-white">${lead.estimatedValue.toLocaleString()}</span>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [leads, setLeads] = useState<LeadWithActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const [metricsRes, leadsRes] = await Promise.all([
          fetch('/api/dashboard/metrics'),
          fetch('/api/leads?limit=10&sortBy=createdAt&sortOrder=desc'),
        ]);
        const metricsData = await metricsRes.json();
        const leadsData = await leadsRes.json();
        setMetrics(metricsData.metrics);
        setLeads(leadsData.leads || []);
      } catch (err) {
        console.error('Dashboard load error:', err);
      } finally {
        setLoading(false);
      }
    }
    loadDashboard();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-black text-white">Pipeline Overview</h1>
        <p className="text-zinc-500 text-sm mt-1">Live AI activity — updated in real time</p>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          title="New Leads Today"
          value={metrics?.newLeadsToday ?? 0}
          subtitle="since midnight"
          color="green"
        />
        <MetricCard
          title="Missed Calls"
          value={metrics?.missedCallsToday ?? 0}
          subtitle="AI responded to all"
          color="white"
        />
        <MetricCard
          title="AI Response Rate"
          value={`${metrics?.responseRate ?? 0}%`}
          subtitle="of missed calls texted back"
          trend="↑ vs last week"
          color="green"
        />
        <MetricCard
          title="Pipeline Value"
          value={`$${((metrics?.pipelineValue ?? 0) / 1000).toFixed(0)}k`}
          subtitle="open opportunities"
          color="white"
        />
      </div>

      {/* Secondary Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <MetricCard
          title="Avg Response Time"
          value={`${metrics?.avgResponseTime ?? 0}s`}
          subtitle="AI fires in under 60s"
          color="green"
        />
        <MetricCard
          title="AI Texts Sent"
          value={metrics?.aiResponsesToday ?? 0}
          subtitle="today"
          color="white"
        />
        <MetricCard
          title="Revenue This Month"
          value={`$${((metrics?.revenueThisMonth ?? 0) / 1000).toFixed(1)}k`}
          subtitle="closed deals"
          color="green"
        />
      </div>

      {/* Recent Leads */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-white">Recent Leads</h2>
          <a href="/dashboard/leads" className="text-xs text-green-400 hover:underline">
            View all →
          </a>
        </div>
        {leads.length === 0 ? (
          <p className="text-zinc-600 text-sm text-center py-8">
            No leads yet. Once your Twilio number is configured, missed calls will appear here automatically.
          </p>
        ) : (
          leads.map((lead) => <LeadRow key={lead.id} lead={lead} />)
        )}
      </div>

      {/* System Status */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
        <h2 className="font-bold text-white mb-3">System Status</h2>
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'AI Engine', status: 'active' },
            { label: 'Twilio Webhook', status: 'active' },
            { label: 'GHL Sync', status: 'pending' },
          ].map((s) => (
            <div key={s.label} className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${s.status === 'active' ? 'bg-green-400' : 'bg-yellow-400'}`} />
              <span className="text-sm text-zinc-400">{s.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
