// Display helpers shared by server and client components. All times are shown in IST.

const IST = 5.5 * 3600_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function inr(n: number | null | undefined, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = n < 0 ? '−' : '';
  return `${sign}₹${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function num(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return Number(n).toLocaleString('en-IN');
}

export function pct(n: number | null | undefined, digits = 1): string {
  if (n == null || !Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(digits)}%`;
}

export function prob(n: number | null | undefined, digits = 3): string {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  return Number(n).toFixed(digits);
}

function ist(iso: string): Date {
  return new Date(Date.parse(iso) + IST);
}

/** "5:40 PM" */
export function timeIST(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = ist(iso);
  let h = d.getUTCHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${String(d.getUTCMinutes()).padStart(2, '0')} ${ampm}`;
}

/** "11 Oct, 5:40 PM" */
export function dateTimeIST(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = ist(iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${timeIST(iso)}`;
}

/** "11 Oct" from a YYYY-MM-DD date key */
export function dayLabel(date: string | null | undefined): string {
  if (!date) return '—';
  const d = new Date(`${date}T00:00:00Z`);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** "Sat" */
export function weekday(date: string): string {
  return WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
}

/** Today's IST date key */
export function todayIST(now = Date.now()): string {
  return new Date(now + IST).toISOString().slice(0, 10);
}

/** Back-compat alias used by older components */
export const simDate = dayLabel;
export const simTime = dateTimeIST;

export function orderCode(id: number | string): string {
  return `EV-${String(id).padStart(6, '0')}`;
}

export function campaignName(createdAt: string): string {
  return `Campaign · ${dateTimeIST(createdAt)}`;
}

export function duration(seconds: number | null | undefined): string {
  if (seconds == null) return '—';
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

// Plain-language labels (spec Appendix G)
export const ACTION_LABEL: Record<string, string> = { none: 'No message', nudge: 'Reminder', discount: '₹50 off offer' };
export const ACTION_LONG: Record<string, string> = {
  none: 'No message',
  nudge: 'Reminder (no discount)',
  discount: '₹50 off offer',
};
export const GROUP_LABEL: Record<string, string> = { model: 'AI-decided', holdout: 'Control group', explore: 'Random test' };
export const REASON_LABEL: Record<string, string> = {
  best_gain: 'Highest expected extra profit',
  no_positive_gain: 'No message earns more than doing nothing',
  cap_applied: 'Offer above the max discount',
  holdout: 'Control group (kept for measurement)',
  explore: 'Random test (keeps the model learning)',
};
export const STATUS_LABEL: Record<string, string> = {
  queued: 'Queued',
  scoring: 'Scoring orders',
  deciding: 'Choosing actions',
  drafting: 'Writing messages',
  ready_for_review: 'Ready to review',
  approved: 'Approved',
  sent: 'Sent',
  closed: 'Closed',
  paused: 'Paused',
};
export const CHANNEL_LABEL: Record<string, string> = { whatsapp: 'WhatsApp', mobile_inbox: 'Mobile inbox' };
export const LIFECYCLE_LABEL: Record<string, string> = {
  new: 'Not eligible',
  eligible: 'Waiting for a campaign',
  in_run: 'In a campaign',
  decided: 'Decided',
  holdout: 'Control group',
  message_drafted: 'Message drafted',
  approved: 'Approved',
  sent: 'Message sent',
  converted: 'Paid online',
  not_converted: 'Stayed COD',
  delivered: 'Delivered',
  rto: 'Returned (RTO)',
  cancelled: 'Cancelled',
};
export const OUTCOME_LABEL: Record<string, string> = { delivered: 'Delivered', rto: 'Returned (RTO)', cancelled: 'Cancelled' };
