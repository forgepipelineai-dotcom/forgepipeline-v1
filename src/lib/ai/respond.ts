// ForgePipeline AI - Core AI Response Engine
// Generates instant replies to missed calls and inbound leads

import OpenAI from 'openai';
import type { AIResponseConfig, Industry } from '@/types';

// Lazy initialization to avoid build-time errors when env vars aren't set
let _openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!_openai) {
    _openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return _openai;
}

const INDUSTRY_CONTEXTS: Record<Industry, string> = {
  roofing: 'roofing contractor (roof repairs, replacements, inspections, storm damage)',
  hvac: 'HVAC contractor (heating, cooling, AC repair, furnace installation)',
  plumbing: 'plumbing contractor (leaks, clogs, water heater, drain cleaning)',
  landscaping: 'landscaping company (lawn care, design, irrigation, tree service)',
  electrical: 'electrical contractor (wiring, panels, outlets, EV chargers)',
  painting: 'painting contractor (interior, exterior, residential, commercial)',
  flooring: 'flooring contractor (hardwood, tile, LVP, carpet)',
  'pest-control': 'pest control company (extermination, prevention, termites)',
  cleaning: 'cleaning service (residential, commercial, deep cleaning)',
  'general-contractor': 'general contractor (remodels, additions, renovations)',
  other: 'home service contractor',
};

export interface GenerateResponseInput {
  callerPhone: string;
  callerName?: string;
  config: AIResponseConfig;
  context?: 'missed_call' | 'inbound_sms' | 'follow_up';
  previousMessages?: Array<{ role: 'user' | 'assistant'; content: string }>;
  incomingMessage?: string;
}

export interface GenerateResponseOutput {
  message: string;
  confidence: number;
  intent?: string;
  suggestedNextStep?: string;
}

export async function generateAIResponse(
  input: GenerateResponseInput
): Promise<GenerateResponseOutput> {
  const {
    callerPhone,
    callerName,
    config,
    context = 'missed_call',
    previousMessages = [],
    incomingMessage,
  } = input;

  const industryContext = INDUSTRY_CONTEXTS[config.industry] || INDUSTRY_CONTEXTS.other;
  const personaName = config.personaName || 'Alex';
  const businessName = config.businessName;

  const systemPrompt = `You are ${personaName}, an AI assistant for ${businessName}, a ${industryContext}.

Your job is to respond to ${context === 'missed_call' ? 'missed calls' : 'incoming messages'} from potential customers quickly and professionally.

Guidelines:
- Be ${config.responseStyle === 'professional' ? 'professional and helpful' : config.responseStyle === 'friendly' ? 'warm, friendly, and approachable' : 'direct and concise'}
- Keep responses SHORT (2-3 sentences max for SMS)
- Always acknowledge the reason they contacted us
- Offer to help schedule a FREE estimate or callback
- ${config.includeBookingLink && config.bookingLink ? `Include the booking link: ${config.bookingLink}` : 'Ask for a good time to call them back'}
- Never make up prices or timelines
- If they have an emergency (burst pipe, no heat in winter, roof leak), prioritize urgency
${config.customInstructions ? `\nCustom instructions: ${config.customInstructions}` : ''}

Business: ${businessName}
Service: ${industryContext}
Response style: ${config.responseStyle}`;

  const userContent =
    context === 'missed_call'
      ? `Someone just called ${businessName} but the call was missed. Their number is ${callerPhone}${callerName ? ` and their name might be ${callerName}` : ''}. Generate a text message to send them right away.`
      : `Customer message: "${incomingMessage}"\n\nRespond to this message appropriately.`;

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
    ...previousMessages.map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    })),
    { role: 'user', content: userContent },
  ];

  const completion = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    max_tokens: 200,
    temperature: 0.7,
  });

  const responseText =
    completion.choices[0]?.message?.content?.trim() || '';

  // Detect intent
  const intentCompletion = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'user',
        content: `Classify the intent of this customer message in 1-3 words. Options: emergency_repair, schedule_estimate, pricing_inquiry, general_question, complaint, unsubscribe, other.\n\nMessage: "${incomingMessage || 'missed call'}"\n\nReturn only the classification.`,
      },
    ],
    max_tokens: 20,
    temperature: 0,
  });

  const intent = intentCompletion.choices[0]?.message?.content?.trim();

  return {
    message: responseText,
    confidence: 0.9,
    intent,
    suggestedNextStep:
      intent === 'emergency_repair'
        ? 'call_immediately'
        : intent === 'schedule_estimate'
        ? 'send_booking_link'
        : 'follow_up_call',
  };
}

// Generate a lead quality score
export async function scoreLeadQuality(
  messages: string[],
  context: string
): Promise<number> {
  if (!messages.length) return 50;

  const completion = await getOpenAI().chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'user',
        content: `Score this lead from 0-100 based on buying intent and urgency for a ${context} company.
        
Messages: ${messages.join('\n')}

Score criteria:
- 80-100: Clear buying intent, urgent need, ready to book
- 60-79: Interested, getting estimates, likely to convert
- 40-59: Exploring options, not urgent
- 20-39: Low intent, just browsing
- 0-19: Likely spam or wrong number

Return only the number.`,
      },
    ],
    max_tokens: 10,
    temperature: 0,
  });

  const score = parseInt(
    completion.choices[0]?.message?.content?.trim() || '50'
  );
  return isNaN(score) ? 50 : Math.min(100, Math.max(0, score));
}
