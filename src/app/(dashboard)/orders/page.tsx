import Link from 'next/link';
import { AutoForm } from '@/components/auto-form';
import { ACTION_TONE, Badge, GROUP_TONE, PageHeader } from '@/components/ui';
import { ACTION_LABEL, GROUP_LABEL, LIFECYCLE_LABEL, dayLabel, inr, num, orderCode, timeIST, weekday } from '@/lib/format';
import { getDb } from '@/lib/server/db.ts';
import { listOrders, ordersByDay } from '@/lib/server/orders.ts';

export const dynamic = 'force-dynamic';

const VIEWS: [string, string][] = [
  ['', 'All orders'],
  ['cod', 'Cash on delivery'],
  ['prepaid', 'Prepaid at checkout'],
  ['eligible', 'Eligible for a campaign'],
  ['ready', 'Waiting for a campaign'],
  ['messaged', 'Messaged'],
  ['paid', 'Paid online after a message'],
];

const STATUS_TONE: Record<string, 'gray' | 'blue' | 'green' | 'red' | 'amber' | 'violet'> = {
  converted: 'green',
  delivered: 'green',
  rto: 'red',
  cancelled: 'amber',
  sent: 'blue',
  eligible: 'violet',
  message_drafted: 'violet',
  holdout: 'gray',
};

export default async function OrdersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const db = getDb();
  const tab = sp.tab === 'days' ? 'days' : 'orders';
  const back = sp.back && sp.back.startsWith('/') ? sp.back : null;
  const dates = await db.query(`select id from order_batches where not is_pilot order by sim_date desc limit 30`);
  const qs = (p: Record<string, string | undefined>) => {
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...p })) if (v) s.set(k, v);
    return `/orders?${s.toString()}`;
  };

  return (
    <div className="space-y-5">
      <PageHeader
        back={back ? { href: back, label: 'Back' } : undefined}
        title="Orders"
        sub="Every order in your store data, and what happened to it."
        actions={
          <div className="flex rounded-lg border border-line bg-panel p-0.5">
            <Link href={qs({ tab: undefined })} className={`rounded-md px-3 py-1 text-[12.5px] ${tab === 'orders' ? 'bg-white font-medium shadow-card' : 'text-ink-soft'}`}>
              By order
            </Link>
            <Link href={qs({ tab: 'days' })} className={`rounded-md px-3 py-1 text-[12.5px] ${tab === 'days' ? 'bg-white font-medium shadow-card' : 'text-ink-soft'}`}>
              By day
            </Link>
          </div>
        }
      />
      {tab === 'days' ? <ByDay /> : <ByOrder sp={sp} dates={dates.map((d) => d.id)} qs={qs} />}
    </div>
  );
}

async function ByDay() {
  const rows = await ordersByDay(getDb());
  return (
    <div className="card overflow-auto">
      <table className="table-base">
        <thead>
          <tr>
            {['Day', 'Orders', 'COD', 'Eligible', 'In a campaign', 'Messaged', 'Resent', 'Control group', 'Paid online', 'Outcome known', 'Used in training'].map((h, i) => (
              <th key={h} className={i ? 'text-right' : ''}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.date}>
              <td>
                <Link href={`/orders?date=${r.date}`} className="link">
                  {weekday(r.date)} {dayLabel(r.date)}
                </Link>
              </td>
              {[r.total_orders, r.cod_orders, r.eligible_orders, r.worked_on, r.sent, r.resent, r.control, r.paid_online, r.resolved, r.in_training].map((v, i) => (
                <td key={i} className="text-right">
                  {num(v)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

async function ByOrder({ sp, dates, qs }: { sp: Record<string, string | undefined>; dates: string[]; qs: (p: Record<string, string | undefined>) => string }) {
  const res = await listOrders(getDb(), {
    date: sp.date,
    view: sp.view,
    group: sp.group,
    status: sp.status,
    training: sp.training,
    page: Number(sp.page ?? 1),
  });
  const sel = (name: string, label: string, opts: [string, string][]) => (
    <label className="flex flex-col gap-1 text-[12px] text-ink-faint">
      {label}
      <select name={name} defaultValue={sp[name] ?? ''} className="input py-1.5 text-[12.5px]">
        {opts.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <>
      <AutoForm className="card flex flex-wrap items-end gap-4 px-4 py-3">
        {sp.back && <input type="hidden" name="back" value={sp.back} />}
        <input type="hidden" name="page" value={sp.page ?? '1'} />
        {sel('date', 'Day', [['', 'All days'], ...dates.map((d) => [d, `${weekday(d)} ${dayLabel(d)}`] as [string, string])])}
        {sel('view', 'Show', VIEWS)}
        {sel('group', 'Campaign group', [
          ['', 'Any'],
          ['model', 'AI-picked'],
          ['holdout', 'Control group'],
          ['explore', 'Random test'],
          ['none', 'Not in a campaign'],
        ])}
        {sel('status', 'Status', [['', 'Any'], ...Object.entries(LIFECYCLE_LABEL)])}
        {sel('training', 'Used to train the model', [
          ['', 'Any'],
          ['yes', 'Yes'],
          ['no', 'No'],
        ])}
        <div className="ml-auto text-[12px] text-ink-faint">{num(res.total)} orders</div>
      </AutoForm>
      <div className="card overflow-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Order</th>
              <th>Placed</th>
              <th>Customer</th>
              <th className="text-right">Value</th>
              <th>Payment</th>
              <th>Eligible?</th>
              <th>Campaign group</th>
              <th>Decision</th>
              <th>Status</th>
              <th>Training</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {res.rows.map((o) => (
              <tr key={o.id}>
                <td className="font-mono text-[12px]">{orderCode(o.id)}</td>
                <td>
                  {dayLabel(o.batch_id)}, {timeIST(o.placed_at)}
                </td>
                <td className="font-mono text-[12px] text-ink-soft">
                  C{o.customer_id}
                  {o.is_first_time && <span className="ml-1 font-sans text-[11px] text-ink-faint">new</span>}
                </td>
                <td className="text-right">{inr(Number(o.value))}</td>
                <td>{o.payment_mode === 'cod' ? 'COD' : 'Prepaid'}</td>
                <td>{o.eligible ? <Badge tone="blue">Eligible</Badge> : <span className="text-[12px] text-ink-faint">{o.ineligible_reason}</span>}</td>
                <td>{o.assignment_group ? <Badge tone={GROUP_TONE[o.assignment_group]}>{GROUP_LABEL[o.assignment_group]}</Badge> : '—'}</td>
                <td>{o.chosen_action ? <Badge tone={ACTION_TONE[o.chosen_action]}>{ACTION_LABEL[o.chosen_action]}</Badge> : '—'}</td>
                <td>
                  <Badge tone={STATUS_TONE[o.lifecycle_state] ?? 'gray'}>
                    {LIFECYCLE_LABEL[o.lifecycle_state]}
                    {o.converted_via === 'organic' ? ' (on their own)' : ''}
                  </Badge>
                </td>
                <td className="text-[12px] text-ink-soft">{o.used_in_training_version ? `Model v${o.used_in_training_version}` : '—'}</td>
                <td>
                  {o.run_id != null && (
                    <a href={`/inspector?run=${o.run_id}&order=${o.id}`} target="_blank" className="text-[12px] font-medium text-rzp hover:underline">
                      Why? ↗
                    </a>
                  )}
                </td>
              </tr>
            ))}
            {res.rows.length === 0 && (
              <tr>
                <td colSpan={11} className="py-8 text-center text-ink-faint">
                  No orders match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-[12px] text-ink-soft">
        <span>
          Page {res.page} of {res.pages}
        </span>
        <div className="flex gap-2">
          {res.page > 1 ? (
            <Link className="btn btn-sm" href={qs({ page: String(res.page - 1) })}>
              Previous
            </Link>
          ) : (
            <span className="btn btn-sm opacity-50">Previous</span>
          )}
          {res.page < res.pages ? (
            <Link className="btn btn-sm" href={qs({ page: String(res.page + 1) })}>
              Next
            </Link>
          ) : (
            <span className="btn btn-sm opacity-50">Next</span>
          )}
        </div>
      </div>
    </>
  );
}
