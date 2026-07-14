// ForgePipeline AI - Core Types

export type Industry =
  | 'roofing'
  | 'hvac'
  | 'plumbing'
  | 'landscaping'
  | 'electrical'
  | 'painting'
  | 'flooring'
  | 'pest-control'
  | 'cleaning'
  | 'general-contractor'
  | 'other';

export type LeadStage = 'new' | 'contacted' | 'qualified' | 'demo' | 'proposal' | 'closed' | 'lost';

export interface LeadWithActivity {
  id: string;
  name?: string;
  phone: string;
  email?: string;
  source: string;
  status: string;
  stage: LeadStage;
  priority: string;
  jobType?: string;
  estimatedValue?: number;
  aiResponded: boolean;
  aiScore?: number;
  createdAt: Date;
  updatedAt: Date;
  messages: MessageSummary[];
  calls: CallSummary[];
  lastActivity?: Date;
}

export interface MessageSummary {
  id: string;
  body: string;
  direction: 'INBOUND' | 'OUTBOUND';
  aiGenerated: boolean;
  sentAt: Date;
}

export interface CallSummary {
  id: string;
  status: string;
  duration: number;
  textBackSent: boolean;
  occurredAt: Date;
}

export interface DashboardMetrics {
  totalLeads: number;
  newLeadsToday: number;
  missedCallsToday: number;
  aiResponsesToday: number;
  responseRate: number;      // % of missed calls that got AI text-back
  conversionRate: number;    // % of leads that converted
  avgResponseTime: number;   // seconds
  revenueThisMonth: number;
  pipelineValue: number;
}

export interface WorkflowStep {
  id: string;
  type: 'send_sms' | 'send_email' | 'wait' | 'condition' | 'update_lead' | 'notify_agent' | 'create_booking' | 'add_to_campaign';
  delay?: number;  // minutes
  config: Record<string, unknown>;
}

export interface AIResponseConfig {
  businessName: string;
  industry: Industry;
  personaName: string;
  responseStyle: 'professional' | 'friendly' | 'direct';
  includeBookingLink: boolean;
  bookingLink?: string;
  customInstructions?: string;
}

export interface GHLContact {
  id: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  tags?: string[];
  customFields?: Record<string, string>;
}

export interface TwilioInboundMessage {
  MessageSid: string;
  From: string;
  To: string;
  Body: string;
  NumMedia: string;
}

export interface TwilioMissedCall {
  CallSid: string;
  From: string;
  To: string;
  CallStatus: string;
  Direction: string;
  Duration: string;
  RecordingUrl?: string;
}

export interface PricingPlan {
  id: 'starter' | 'pro' | 'agency';
  name: string;
  price: number;
  interval: 'month' | 'year';
  stripePriceId: string;
  features: string[];
  limits: {
    locations: number;
    contacts: number;
    messagesPerMonth: number;
    teamMembers: number;
  };
}

export interface OnboardingData {
  businessName: string;
  industry: Industry;
  phone: string;
  email: string;
  city: string;
  state: string;
  plan: 'starter' | 'pro' | 'agency';
}
