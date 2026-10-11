import Link from 'next/link';
import { PageHeader } from '@/components/cards';
import { AutoRefresh } from '@/components/live';
import { MessagesGrid } from '@/components/messages-grid';
import { STATUS_LABEL } from '@/lib/format';
import { getDb } from '@/lib/server/db.ts';
import { messageRows, runOptions } from '@/lib/server/messages.ts';

export const dynamic = 'force-dynamic';

export default async function MessagesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const db = getDb();
  const runs = await runOptions(db);
  const done = runs.filter((r) => !['queued', 'scoring', 'deciding', 'drafting'].includes(r.status));
  const runId = Number(sp.run ?? done[0]?.id ?? 0);
  const run = runs.find((r) => Number(r.id) === runId);
  if (!run) {
    return (
      <div>
        <PageHeader title="Messages" />
        <div className="card card-pad text-sm text-ink-faint">
          No completed runs yet.{' '}
          <Link href="/runs/new" className="font-medium text-rzp hover:underline">
            Create a run
          </Link>
          .
        </div>
      </div>
    );
  }
  const rows = await messageRows(db, runId);
  return (
    <div>
      <AutoRefresh on={run.status === 'sent' ? ['clock', 'runs'] : ['runs']} />
      <PageHeader
        title="Messages"
        sub={`Run #${runId} · ${STATUS_LABEL[run.status]} · one row per order. Click a message to edit it before sending.`}
        actions={
          <Link href={`/runs/${runId}`} className="btn">
            Run review
          </Link>
        }
      />
      <MessagesGrid
        key={runId}
        runId={runId}
        runStatus={run.status}
        runs={done.map((r) => ({ id: Number(r.id), status: r.status, order_count: Number(r.order_count) }))}
        rows={rows}
        initialFilters={{ group: sp.group ?? '', action: sp.action ?? '' }}
      />
    </div>
  );
}
