import Link from 'next/link';
import { inr, num, pct, simTime } from '@/lib/format';
import type { RunResults } from '@/lib/server/results.ts';

export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: 'brand' | 'muted';
}) {
  return (
    <div className="card card-pad">
      <div className="label">{label}</div>
      <div className={`metric mt-1 ${tone === 'brand' ? 'text-brand-700' : tone === 'muted' ? 'text-ink-soft' : ''}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-ink-faint">{sub}</div>}
    </div>
  );
}

export function PageHeader({ title, sub, actions }: { title: string; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1>{title}</h1>
        {sub && <div className="mt-0.5 text-sm text-ink-soft">{sub}</div>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

function Cell({ label, value, sub, strong }: { label: string; value: React.ReactNode; sub?: React.ReactNode; strong?: boolean }) {
  return (
    <div className="min-w-0 px-3 py-2">
      <div className="label truncate">{label}</div>
      <div className={`mt-0.5 tabular-nums ${strong ? 'text-lg font-semibold' : 'text-base font-medium'}`}>{value}</div>
      {sub && <div className="text-2xs text-ink-faint">{sub}</div>}
    </div>
  );
}

/** Per-send gain card (section 7.5). */
export function GainCard({ r, compact = false }: { r: RunResults; compact?: boolean }) {
  const f = r.funnel;
  const pending = r.realised_gain == null;
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between border-b border-line bg-canvas px-3 py-2">
        <div className="text-sm font-semibold">
          <Link href={`/results?run=${r.run.id}`} className="hover:underline">
            Run #{r.run.id}
          </Link>
          <span className="ml-2 text-xs font-normal text-ink-faint">sent {simTime(f.sent_at)}</span>
        </div>
        <span className="text-2xs text-ink-faint">batch {(r.run.source_batch_ids ?? []).join(', ')}</span>
      </div>
      <div className={`grid divide-x divide-line ${compact ? 'grid-cols-4' : 'grid-cols-7'}`}>
        <Cell label="Sent" value={num(f.sent)} />
        <Cell label="Delivered" value={num(f.delivered)} sub={f.sent ? pct(f.delivered / f.sent, 0) : undefined} />
        <Cell label="Opened" value={num(f.opened)} sub={f.delivered ? pct(f.opened / f.delivered, 0) : undefined} />
        <Cell label="Clicked" value={num(f.clicked)} sub={`CTR ${pct(f.ctr)}`} />
        {!compact && <Cell label="Converted" value={num(f.converted)} sub={f.sent ? pct(f.converted / f.sent) : undefined} />}
        {!compact && <Cell label="Est. gain" value={inr(r.estimated_gain_sent)} sub="from decisions" />}
        {!compact && (
          <Cell
            label="Realised vs holdout"
            strong
            value={pending ? <span className="text-ink-faint">Pending</span> : <span className={r.realised_gain! >= 0 ? 'text-brand-700' : 'text-red-700'}>{inr(r.realised_gain)}</span>}
            sub={pending ? `${pct(r.resolved_share, 0)} of outcomes resolved` : `${inr(r.incremental_per_order, 2)} per eligible order`}
          />
        )}
      </div>
      {compact && (
        <div className="grid grid-cols-3 divide-x divide-line border-t border-line">
          <Cell label="Converted" value={num(f.converted)} />
          <Cell label="Est. gain" value={inr(r.estimated_gain_sent)} />
          <Cell
            label="Realised vs holdout"
            value={pending ? <span className="text-ink-faint">Pending</span> : inr(r.realised_gain)}
            sub={pending ? `${pct(r.resolved_share, 0)} resolved` : undefined}
          />
        </div>
      )}
    </div>
  );
}

export function SimNote() {
  return <span className="text-2xs text-ink-faint">Simulated</span>;
}
