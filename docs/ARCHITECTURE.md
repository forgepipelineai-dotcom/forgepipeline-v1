# ForgePipeline AI — Architecture Overview

## What It Is
ForgePipeline AI is a B2B SaaS platform that provides AI-powered lead capture, missed-call recovery, and automated CRM for local service businesses (roofers, HVAC, plumbers, landscapers, etc.).

---

## Core Value Proposition
> "A missed call is a missed job. ForgePipeline responds in 60 seconds — automatically."

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | Next.js 14 (App Router) + Tailwind | Dashboard, landing page, onboarding |
| Backend | Next.js API Routes | REST API, webhooks |
| Database | Supabase PostgreSQL + Prisma | Data storage, auth |
| AI Engine | OpenAI GPT-4o Mini | Lead responses, scoring, qualification |
| SMS/Calls | Twilio | Incoming call/SMS webhooks, outbound SMS |
| CRM Sync | GoHighLevel API | Contacts, opportunities, pipelines |
| Billing | Stripe | Subscriptions, webhooks |
| Deployment | Vercel | Hosting, edge functions |

---

## Core Flows

### 1. Missed Call → Text-Back (Core Feature)
```
Customer calls business number (Twilio)
  → Twilio webhook: POST /api/webhooks/twilio
  → System checks org by phone number
  → Creates/finds lead in database
  → Generates AI response (GPT-4o-mini)
  → Sends SMS text-back within 60 seconds
  → Logs everything: call, message, lead activity
  → Syncs to GHL if integration active
```

### 2. Inbound SMS → AI Conversation
```
Customer texts the business number
  → Twilio webhook fires
  → Load conversation history for this lead
  → Generate context-aware AI reply
  → Return TwiML with response
  → Log message in database
```

### 3. Onboarding Flow
```
User signs up → Supabase Auth
  → Create Organization record
  → Stripe customer created
  → 14-day trial begins
  → Connect Twilio number
  → Connect GHL (optional)
  → Dashboard live
```

---

## Database Structure
See `prisma/schema.prisma` for full schema.

Key models:
- **Organization** — client business account, plan, settings
- **User** — team members, tied to org via Supabase auth
- **Lead** — prospect record (phone, status, stage, AI score)
- **CallLog** — every inbound call with text-back tracking
- **Message** — SMS conversation history
- **Workflow** — automation sequences (triggers + steps)
- **Campaign** — outbound SMS/email campaigns
- **AnalyticsEvent** — tracks all revenue-relevant events

---

## Pricing Plans

| Plan | Price | Locations | Contacts | Key Feature |
|---|---|---|---|---|
| Starter | $297/mo | 1 | 500 | AI text-back + SMS |
| Pro | $597/mo | 3 | 2,000 | + GHL sync + sequences |
| Agency | $997/mo | Unlimited | Unlimited | + White-label + API |

---

## Integrations
- **Twilio** — phone number management, SMS, call webhooks
- **GoHighLevel** — CRM sync, pipeline management, bookings
- **Stripe** — subscription billing, invoicing
- **Supabase** — auth, database, real-time subscriptions
- **OpenAI** — AI response generation, lead scoring

---

## Deployment Checklist (When Ready to Launch)
- [ ] Supabase project created, schema pushed
- [ ] Twilio account + phone number(s) purchased
- [ ] Stripe products + prices created
- [ ] OpenAI API key configured
- [ ] GHL developer app created (for OAuth)
- [ ] Vercel project deployed
- [ ] Twilio webhooks pointed to production URL
- [ ] Stripe webhooks configured
- [ ] Domain: forgepipelineai.com pointed to Vercel
- [ ] SSL confirmed
