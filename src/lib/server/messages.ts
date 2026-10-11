import type { Db } from './db.ts';

export interface MessageRow {
  order_id: number;
  customer_id: number;
  value: number;
  batch_id: string;
  placed_at: string;
  group: string | null;
  is_resend: boolean;
  send_count: number;
  action: string | null;
  discount: number;
  gain: number | null;
  channel: string;
  consent: boolean;
  text: string | null;
  edited: boolean;
  variant: string | null;
  fallback: boolean | null;
  review: string | null;
  sent: boolean;
  delivered: boolean;
  opened: boolean;
  clicked: boolean;
  converted: boolean;
  converted_via: string | null;
  outcome: string | null;
  lifecycle: string;
  /** plain-language status after sending */
  status: string;
  status_tone: 'gray' | 'blue' | 'green' | 'red' | 'amber' | 'violet';
}

function statusOf(r: Omit<MessageRow, 'status' | 'status_tone'>): [string, MessageRow['status_tone']] {
  if (r.outcome === 'rto') return ['Returned (RTO)', 'red'];
  if (r.outcome === 'cancelled') return ['Cancelled', 'amber'];
  if (r.converted) {
    const label = r.converted_via === 'organic' ? 'Paid online (on their own)' : 'Paid online';
    return [r.outcome === 'delivered' ? `${label} · delivered` : label, 'green'];
  }
  if (r.outcome === 'delivered') return ['Stayed COD · delivered', 'gray'];
  if (r.sent) {
    if (r.clicked) return ['Clicked link', 'blue'];
    if (r.opened) return ['Opened', 'blue'];
    if (r.delivered) return ['Delivered to phone', 'gray'];
    return ['Sent', 'gray'];
  }
  if (r.group === 'holdout') return ['Control · no message', 'gray'];
  if (r.action === 'none') return ['No message', 'gray'];
  if (r.text) return [r.review === 'rejected' ? 'Excluded' : 'Draft ready', 'violet'];
  return ['Waiting', 'gray'];
}

export async function messageRows(db: Db, runId: number): Promise<MessageRow[]> {
  const rows = await db.query(
    `select ro.order_id, o.customer_id, o.value, o.batch_id, o.placed_at, ro.assignment_group, ro.is_resend, o.send_count,
       d.chosen_action, d.discount_applied, d.gain_nudge, d.gain_discount, o.features->>'channel' as channel,
       case when o.features->>'channel' = 'whatsapp' then c.consent_whatsapp else c.consent_inbox end as consent,
       m.final_text, m.edited_text, m.variant_tag, m.fallback_used, m.review,
       s.id as send_id, o.converted_at, o.converted_via, o.final_outcome, o.lifecycle_state,
       coalesce(ev.delivered, false) as delivered, coalesce(ev.opened, false) as opened,
       coalesce(ev.clicked, false) as clicked
     from run_orders ro
     join orders o on o.id = ro.order_id
     join customers c on c.id = o.customer_id
     left join decisions d on d.run_id = ro.run_id and d.order_id = ro.order_id
     left join messages m on m.run_id = ro.run_id and m.order_id = ro.order_id
     left join sends s on s.run_id = ro.run_id and s.order_id = ro.order_id
     left join lateral (
       select bool_or(e.type = 'delivered') as delivered, bool_or(e.type = 'opened') as opened, bool_or(e.type = 'clicked') as clicked
       from events e where e.send_id = s.id
     ) ev on true
     where ro.run_id = $1
     order by ro.seq`,
    [runId],
  );
  return rows.map((r) => {
    const base = {
    order_id: Number(r.order_id),
    customer_id: Number(r.customer_id),
    value: Number(r.value),
    batch_id: r.batch_id,
    group: r.assignment_group,
    placed_at: r.placed_at,
    is_resend: Boolean(r.is_resend),
    send_count: Number(r.send_count),
    action: r.chosen_action,
    discount: Number(r.discount_applied ?? 0),
    gain:
      r.chosen_action === 'nudge' ? Number(r.gain_nudge) : r.chosen_action === 'discount' ? Number(r.gain_discount) : r.chosen_action ? 0 : null,
    channel: r.channel,
    consent: Boolean(r.consent),
    text: r.final_text,
    edited: r.edited_text != null,
    variant: r.variant_tag,
    fallback: r.fallback_used,
    review: r.review,
    sent: r.send_id != null,
    delivered: Boolean(r.delivered),
    opened: Boolean(r.opened),
    clicked: Boolean(r.clicked),
    converted: r.converted_at != null,
    converted_via: r.converted_via,
    outcome: r.final_outcome,
    lifecycle: r.lifecycle_state,
    };
    const [status, status_tone] = statusOf(base);
    return { ...base, status, status_tone };
  });
}

export async function runOptions(db: Db) {
  return db.query(`select id, status, order_count, source_batch_ids from runs where not is_pilot order by id desc limit 50`);
}
