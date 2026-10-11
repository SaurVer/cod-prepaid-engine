// Anthropic Messages API call for message drafting (Appendix E). Model name from LLM_MODEL.

import {
  type DraftOrder,
  type Variant,
  batchUserMessage,
  expectedVariant,
  fallbackText,
  parseBatchReply,
  systemPrompt,
  userMessage,
  validateDraft,
} from '../core/llm.ts';

export interface DraftResult {
  order_id: string;
  prompt: string;
  output: string;
  text: string;
  variant: Variant;
  fallback: boolean;
}

const BATCH = 20;
const CONCURRENCY = 5;
const RETRIES = 2;

export function llmModel(): string {
  return process.env.LLM_MODEL || 'claude-haiku-5-5';
}

async function callOnce(system: string, user: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45_000);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: llmModel(),
        max_tokens: 4096,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    const body = (await res.json()) as { content?: { type: string; text?: string }[] };
    return (body.content ?? []).map((c) => c.text ?? '').join('');
  } finally {
    clearTimeout(timer);
  }
}

async function draftBatch(orders: DraftOrder[], merchant: string, tone: string): Promise<DraftResult[]> {
  const system = systemPrompt(merchant, tone);
  const user = batchUserMessage(orders);
  let items: unknown[] | null = null;
  let lastError = '';
  for (let attempt = 0; attempt <= RETRIES && !items; attempt++) {
    try {
      const reply = await callOnce(system, user);
      items = parseBatchReply(reply);
      if (!items) lastError = `invalid JSON: ${reply.slice(0, 200)}`;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  const byId = new Map<string, unknown>();
  if (items) {
    for (const it of items) {
      const id = it && typeof it === 'object' ? String((it as Record<string, unknown>).order_id ?? '') : '';
      if (id) byId.set(id, it);
    }
  }
  return orders.map((o) => {
    const item = byId.get(o.order_id);
    const prompt = `${system}\n\n---\n${userMessage(o)}`;
    const valid = item ? validateDraft(item, o) : null;
    if (valid) {
      return { order_id: o.order_id, prompt, output: JSON.stringify(item), text: valid.text, variant: valid.variant, fallback: false };
    }
    const variant = expectedVariant(o);
    return {
      order_id: o.order_id,
      prompt,
      output: item ? `Rejected by validation: ${JSON.stringify(item)}` : `No usable output (${lastError || 'missing from reply'})`,
      text: fallbackText(variant, merchant, o.discount),
      variant,
      fallback: true,
    };
  });
}

/** Draft messages in batches of ~20 orders, at most 5 calls at a time; retry twice, then fall back. */
export async function draftMessages(orders: DraftOrder[], merchant: string, tone: string): Promise<DraftResult[]> {
  const batches: DraftOrder[][] = [];
  for (let i = 0; i < orders.length; i += BATCH) batches.push(orders.slice(i, i + BATCH));
  const out: DraftResult[] = [];
  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const results = await Promise.all(batches.slice(i, i + CONCURRENCY).map((b) => draftBatch(b, merchant, tone)));
    for (const r of results) out.push(...r);
  }
  return out;
}
