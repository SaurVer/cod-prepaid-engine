// Step 3 helpers (Appendix E). Pure: prompt building, output validation, fallback templates.
// The LLM never picks the action or the discount, and wording has no effect on simulated outcomes.

export type Hint = 'reminder' | 'reassurance';
export type Variant = 'reminder' | 'reassurance' | 'offer';

export interface DraftOrder {
  order_id: string;
  action: 'nudge' | 'discount';
  discount: number; // 0 for nudge
  hint: Hint;
  delivered_orders: number;
  last_category: string;
  channel: 'whatsapp' | 'mobile_inbox';
}

export function hintFor(pastDeliveryIssue: boolean): Hint {
  return pastDeliveryIssue ? 'reassurance' : 'reminder';
}

export function expectedVariant(o: Pick<DraftOrder, 'action' | 'hint'>): Variant {
  return o.action === 'discount' ? 'offer' : o.hint;
}

export function channelLabel(c: DraftOrder['channel']): string {
  return c === 'whatsapp' ? 'WhatsApp' : 'mobile inbox';
}

/** Appendix E system prompt, with one addition so ~20 orders can be drafted per call. */
export function systemPrompt(merchantName: string, toneGuide: string): string {
  return [
    `You write short prepaid-conversion messages for ${merchantName}, a D2C wellness brand. Tone: ${toneGuide}.`,
    'The customer already placed a cash-on-delivery order. Your message invites them to pay online now with a one-tap link.',
    'Rules: max 300 characters; no false urgency or countdowns; no pressure; mention the discount only if one is given, with its exact amount; never mention data about the customer beyond what is provided; end with the placeholder {link}.',
    'Return JSON only: {"text": "...", "variant_tag": "reminder" | "reassurance" | "offer"}',
    '',
    'You will receive several orders, each starting with "Order <order_id>". Write one message per order and return a JSON array only, one object per order, in the same order: [{"order_id": "...", "text": "...", "variant_tag": "..."}]',
  ].join('\n');
}

/** Appendix E user message for one order. */
export function userMessage(o: DraftOrder): string {
  return [
    `Action: ${o.action}`,
    `Discount: ${o.action === 'discount' ? `₹${o.discount}` : 'none'}`,
    `Hesitation hint: ${o.hint}`,
    `Customer facts: ${o.delivered_orders} smooth deliveries with us; last ordered ${o.last_category}; channel ${channelLabel(o.channel)}.`,
  ].join('\n');
}

export function batchUserMessage(orders: DraftOrder[]): string {
  return orders.map((o) => `Order ${o.order_id}\n${userMessage(o)}`).join('\n\n');
}

export function fallbackText(variant: Variant, merchant: string, discount: number): string {
  switch (variant) {
    case 'reminder':
      return `Hi! Your ${merchant} order is on its way. Skip the cash at the door: pay online in one tap {link}`;
    case 'reassurance':
      return `Your ${merchant} order ships soon with live tracking. Pay online now and we'll keep you updated until it arrives {link}`;
    case 'offer':
      return `Pay online for your ${merchant} order and get ₹${discount} off, in one tap {link}`;
  }
}

/** Extract a JSON array from the model's reply (tolerates code fences or stray prose). */
export function parseBatchReply(reply: string): unknown[] | null {
  const start = reply.indexOf('[');
  const end = reply.lastIndexOf(']');
  if (start < 0 || end <= start) return null;
  try {
    const v = JSON.parse(reply.slice(start, end + 1));
    return Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}

/** Validate one drafted message against the Appendix E rules. Returns null if invalid. */
export function validateDraft(item: unknown, o: DraftOrder): { text: string; variant: Variant } | null {
  if (!item || typeof item !== 'object') return null;
  const rec = item as Record<string, unknown>;
  const text = typeof rec.text === 'string' ? rec.text.trim() : '';
  if (!text || text.length > 300) return null;
  if (!text.endsWith('{link}')) return null;
  if ((text.match(/\{link\}/g) ?? []).length !== 1) return null;
  if (o.action === 'discount') {
    if (!text.includes(`₹${o.discount}`)) return null;
  } else if (/₹\s?\d/.test(text)) {
    return null; // a nudge must not mention any discount
  }
  return { text, variant: expectedVariant(o) };
}
