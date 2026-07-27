/**
 * LLM adapter — thin, swappable interface for Anthropic conversation turns.
 *
 * Default path  : claude-haiku-4-5-20251001  (fast, cheap, phone-turn appropriate)
 * Escalation    : claude-sonnet-5             (stronger judgment for emergencies /
 *                                              far-off-script conversations)
 *
 * Model strings verified against platform.claude.com/docs/en/about-claude/models/overview
 * on 2026-07-27. Both are current, generally-available Claude API IDs.
 *
 * Callers should never reference a model string directly — always call chat().
 * To swap models, change HAIKU_MODEL / SONNET_MODEL here and nowhere else.
 */

import Anthropic from '@anthropic-ai/sdk';

const HAIKU_MODEL  = 'claude-haiku-4-5-20251001';
const SONNET_MODEL = 'claude-sonnet-5';

const MAX_TOKENS_DEFAULT    = 150;  // short phone turns
const MAX_TOKENS_ESCALATION = 300;  // more headroom when Sonnet is thinking

export interface ChatResponse {
  text:      string;
  model:     string;
  escalated: boolean;
  inputTokens:  number;
  outputTokens: number;
}

export interface ChatOptions {
  system:   string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  /**
   * When true, routes to Sonnet (emergency / far-off-script).
   * Defaults to false (Haiku).
   */
  escalate?: boolean;
}

let _client: Anthropic | null = null;
function client(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY is not set');
    }
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

/**
 * Single conversation turn: prompt in, structured response out.
 * Model selection is fully encapsulated here.
 */
export async function chat(opts: ChatOptions): Promise<ChatResponse> {
  const escalated = opts.escalate ?? false;
  const model     = escalated ? SONNET_MODEL : HAIKU_MODEL;
  const maxTokens = escalated ? MAX_TOKENS_ESCALATION : MAX_TOKENS_DEFAULT;

  const resp = await client().messages.create({
    model,
    max_tokens: maxTokens,
    system:     opts.system,
    messages:   opts.messages,
  });

  const textBlock = resp.content.find((b) => b.type === 'text');
  const text      = textBlock?.type === 'text' ? textBlock.text : '';

  return {
    text,
    model,
    escalated,
    inputTokens:  resp.usage.input_tokens,
    outputTokens: resp.usage.output_tokens,
  };
}
