import Link from 'next/link';
import { AutoRefresh } from '@/components/live';
import { Badge, PageHeader, Tile } from '@/components/ui';
import { STATUS_LABEL, campaignName, dateTimeIST, dayLabel, inr, num, pct, weekday } from '@/lib/format';
import { getDb } from '@/lib/server/db.ts';
import { listCampaigns } from '@/lib/server/results.ts';

export const dynamic = 'force-dynamic';

const TONE: Record<string, 'green' | 'violet' | 'blue' | 'gray'> = { sent: 'green', ready_for_review: 'violet', closed: 'gray' };

export default async function CampaignsPage() {
  const rows = await listCampaigns(getDb());
  const sent = rows.filter((r) => r.status === 'sent');
  const measured = sent.filter((r) => r.extra_total != null);
  return (
    <div className="space-y-5">
      <AutoRefresh />
      <PageHeader
        title="Campaigns"
        sub="Every campaign you have run: past days (replays) and today. Open one to review and send it, or to see its results."
        actions={
          <Link href="/" className="btn btn-primary">
            Run a campaign
          </Link>
        }
      />
      <div className="grid grid-cols-4 gap-4">
        <Tile label="Campaigns" value={num(rows.length)} sub={`${num(sent.length)} sent · ${num(rows.length - sent.length)} not sent yet`} />
        <Tile label="Messages sent" value={num(sent.reduce((a, r) => a + r.sent, 0))} />
        <Tile label="Paid online after a message" tone="blue" value={num(sent.reduce((a, r) => a + r.paid_online, 0))} />
        <Tile
          label="Extra profit vs control"
          tone="green"
          value={inr(measured.reduce((a, r) => a + (r.extra_total ?? 0), 0))}
          sub={`${measured.length} of ${sent.length} sent campaigns fully measured`}
        />
      </div>
      <div className="card overflow-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Orders from</th>
              <th>Status</th>
              <th className="text-right">Orders</th>
              <th className="text-right">Control</th>
              <th className="text-right">Random test</th>
              <th className="text-right">AI-decided</th>
              <th className="text-right">Messages sent</th>
              <th className="text-right">Paid online</th>
              <th className="text-right">Expected extra profit</th>
              <th className="text-right">Extra profit vs control</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/campaigns/${r.id}`} className="link">
                    {campaignName(r.created_at)}
                  </Link>
                  <div className="text-[11px] text-ink-faint">
                    {r.replay ? `Replay · run ${r.started_real_at ? dateTimeIST(r.started_real_at) : ''}` : 'Live'} · model v{r.model_version}
                  </div>
                </td>
                <td>
                  {weekday(r.date)} {dayLabel(r.date)}
                </td>
                <td>
                  <span className="flex items-center gap-1.5">
                    <Badge tone={TONE[r.status] ?? 'blue'}>
                      {STATUS_LABEL[r.status]}
                      {['queued', 'scoring', 'deciding', 'drafting'].includes(r.status) ? ` · ${Math.round(r.progress)}%` : ''}
                    </Badge>
                    {r.replay && <Badge tone="amber">Replay</Badge>}
                  </span>
                </td>
                <td className="text-right">{num(r.order_count)}</td>
                <td className="text-right">
                  {num(r.control)} <span className="text-ink-faint">· {pct(r.holdout_pct, 0)}</span>
                </td>
                <td className="text-right">
                  {num(r.random_test)} <span className="text-ink-faint">· {pct(r.explore_pct, 0)}</span>
                </td>
                <td className="text-right">{num(r.ai)}</td>
                <td className="text-right">{r.status === 'sent' ? num(r.sent) : '—'}</td>
                <td className="text-right">{r.status === 'sent' ? num(r.paid_online) : '—'}</td>
                <td className="text-right">{['queued', 'scoring', 'deciding'].includes(r.status) ? '—' : inr(r.expected_gain)}</td>
                <td className="text-right">
                  {r.status !== 'sent' ? (
                    '—'
                  ) : r.extra_total == null ? (
                    <span className="text-ink-faint">Measuring · {pct(r.resolved_share, 0)}</span>
                  ) : (
                    <span className={`font-medium ${r.extra_total >= 0 ? 'text-ok' : 'text-bad'}`}>{inr(r.extra_total)}</span>
                  )}
                </td>
                <td className="text-right">
                  <Link href={`/campaigns/${r.id}`} className="link text-[12px]">
                    {r.status === 'ready_for_review' ? 'Review & send →' : 'Open →'}
                  </Link>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={12} className="py-10 text-center text-ink-faint">
                  No campaigns yet. Open a day on the{' '}
                  <Link href="/" className="link">
                    Overview
                  </Link>{' '}
                  and click Run campaign. Past days replay as if sent at 9 PM that evening.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
