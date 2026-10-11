import Link from 'next/link';

export function PageHeader({ title, sub, actions, back }: { title: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-5">
      {back && (
        <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-[12.5px] font-medium text-rzp hover:underline">
          ← {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>{title}</h1>
          {sub && <div className="mt-1 text-[13px] text-ink-soft">{sub}</div>}
        </div>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

/** KPI tile; pass href to make it open a filtered list. */
export function Tile({
  label,
  value,
  sub,
  href,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  href?: string;
  tone?: 'blue' | 'green' | 'muted';
}) {
  const body = (
    <>
      <div className="flex items-center justify-between">
        <span className="label">{label}</span>
        {href && <span className="text-[11px] font-medium text-rzp opacity-0 transition-opacity group-hover:opacity-100">View →</span>}
      </div>
      <div className={`metric mt-1.5 ${tone === 'blue' ? 'text-rzp' : tone === 'green' ? 'text-ok' : tone === 'muted' ? 'text-ink-soft' : ''}`}>{value}</div>
      {sub && <div className="mt-1 text-[12px] text-ink-faint">{sub}</div>}
    </>
  );
  const cls = 'card group block min-h-[104px] px-4 py-3.5';
  return href ? (
    <Link href={href} className={`${cls} transition-colors hover:border-rzp/40 hover:shadow-pop`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function Badge({ children, tone = 'gray' }: { children: React.ReactNode; tone?: 'gray' | 'blue' | 'green' | 'red' | 'amber' | 'violet' }) {
  const t = {
    gray: 'bg-panel text-ink-soft',
    blue: 'bg-rzp-soft text-rzp',
    green: 'bg-ok-soft text-ok',
    red: 'bg-bad-soft text-bad',
    amber: 'bg-warn-soft text-warn',
    violet: 'bg-[#F1ECFF] text-[#6B4BD8]',
  }[tone];
  return <span className={`pill ${t}`}>{children}</span>;
}

export function Help({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px] leading-relaxed text-ink-faint">{children}</p>;
}

export const ACTION_TONE: Record<string, 'gray' | 'blue' | 'violet'> = { none: 'gray', nudge: 'blue', discount: 'violet' };
export const GROUP_TONE: Record<string, 'blue' | 'gray' | 'amber'> = { model: 'blue', holdout: 'gray', explore: 'amber' };
