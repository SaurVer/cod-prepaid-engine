// Display helpers shared by server and client components. Sim time is shown in UTC (the sim's own clock).

export function inr(n: number | null | undefined, digits = 0): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const sign = n < 0 ? '−' : '';
  return `${sign}₹${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function num(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
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

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function simTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${hh}:${mm}`;
}

export function simDate(isoOrDate: string | null | undefined): string {
  if (!isoOrDate) return '—';
  const d = new Date(isoOrDate.length === 10 ? `${isoOrDate}T00:00:00Z` : isoOrDate);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

export function orderCode(id: number | string): string {
  return `VD-${String(id).padStart(6, '0')}`;
}

export function duration(seconds: number | null | undefined): string {
  if (seconds == null) return '—';
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))}s`;
  return `${Math.floor(seconds / 60)}m ${Math.round(seconds % 60)}s`;
}

export const ACTION_LABEL: Record<string, string> = { none: 'No action', nudge: 'Nudge', discount: 'Discount' };
export const GROUP_LABEL: Record<string, string> = { model: 'Model', holdout: 'Holdout', explore: 'Explore' };
export const REASON_LABEL: Record<string, string> = {
  best_gain: 'Best gain',
  no_positive_gain: 'No positive gain',
  cap_applied: 'Cap applied',
  holdout: 'Holdout',
  explore: 'Explore',
};
export const STATUS_LABEL: Record<string, string> = {
  queued: 'Queued',
  scoring: 'Scoring',
  deciding: 'Deciding',
  drafting: 'Drafting',
  ready_for_review: 'Ready for review',
  approved: 'Approved',
  sent: 'Sent',
  closed: 'Closed',
  paused: 'Paused',
};
export const CHANNEL_LABEL: Record<string, string> = { whatsapp: 'WhatsApp', mobile_inbox: 'Mobile inbox' };
export const LIFECYCLE_LABEL: Record<string, string> = {
  new: 'New',
  eligible: 'Eligible',
  in_run: 'In run',
  decided: 'Decided',
  holdout: 'Holdout',
  message_drafted: 'Message drafted',
  approved: 'Approved',
  sent: 'Sent',
  converted: 'Converted',
  not_converted: 'Not converted',
  delivered: 'Delivered',
  rto: 'RTO',
  cancelled: 'Cancelled',
};
