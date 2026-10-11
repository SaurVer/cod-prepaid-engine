'use client';

import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ACTION_LABEL, CHANNEL_LABEL, GROUP_LABEL, inr, num, orderCode } from '@/lib/format';
import type { MessageRow } from '@/lib/server/messages.ts';
import { api, useLive } from './live';
import { ACTION_TONE, Badge, GROUP_TONE } from './ui';

function EditableMessage({ row, runId, locked, onSaved }: { row: MessageRow; runId: number; locked: boolean; onSaved: (t: string) => void }) {
  const { toast } = useLive();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.text ?? '');
  const [saving, setSaving] = useState(false);
  if (!row.text) return <span className="text-ink-faint">—</span>;
  if (!editing) {
    return (
      <button
        className={`block max-w-[380px] truncate text-left ${locked ? 'cursor-default' : 'hover:text-rzp'}`}
        title={locked ? row.text : 'Click to edit'}
        onClick={() => {
          if (locked) return;
          setDraft(row.text ?? '');
          setEditing(true);
        }}
      >
        {row.edited && <span className="mr-1.5 rounded bg-rzp-soft px-1 text-[10px] font-semibold text-rzp">EDITED</span>}
        {row.text}
        {!locked && <span className="ml-1.5 text-[11px] text-rzp">✎</span>}
      </button>
    );
  }
  const save = async () => {
    setSaving(true);
    try {
      await api('/api/messages', { method: 'PATCH', json: { runId, orderId: row.order_id, text: draft } });
      onSaved(draft.trim());
      setEditing(false);
      toast('Message saved. Your edit is logged.', 'info');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="w-[380px] whitespace-normal">
      <textarea className="input h-24 w-full text-[12.5px]" value={draft} maxLength={300} autoFocus onChange={(e) => setDraft(e.target.value)} />
      <div className="mt-1.5 flex items-center gap-2">
        <button className="btn btn-sm btn-primary" disabled={saving} onClick={save}>
          Save
        </button>
        <button className="btn btn-sm" disabled={saving} onClick={() => setEditing(false)}>
          Cancel
        </button>
        <span className="ml-auto text-[11px] text-ink-faint">{draft.length}/300 · keep {'{link}'} at the end</span>
      </div>
    </div>
  );
}

export function CampaignGrid({ runId, editable, rows: initialRows, initialAction, initialGroup }: { runId: number; editable: boolean; rows: MessageRow[]; initialAction?: string; initialGroup?: string }) {
  const [rows, setRows] = useState(initialRows);
  useEffect(() => setRows(initialRows), [initialRows]);
  const [action, setAction] = useState(initialAction ?? '');
  const [group, setGroup] = useState(initialGroup ?? '');
  const [status, setStatus] = useState('');
  const [sorting, setSorting] = useState<SortingState>([]);

  const statuses = useMemo(() => Array.from(new Set(initialRows.map((r) => r.status))).sort(), [initialRows]);
  const filtered = useMemo(
    () => rows.filter((r) => (!action || r.action === action) && (!group || r.group === group) && (!status || r.status === status)),
    [rows, action, group, status],
  );

  const columns = useMemo<ColumnDef<MessageRow>[]>(
    () => [
      { accessorKey: 'order_id', header: 'Order', cell: (c) => <span className="font-mono text-[12px]">{orderCode(c.getValue<number>())}</span> },
      { accessorKey: 'customer_id', header: 'Customer', cell: (c) => <span className="font-mono text-[12px] text-ink-soft">C{c.getValue<number>()}</span> },
      { accessorKey: 'value', header: 'Order value', cell: (c) => inr(c.getValue<number>()) },
      {
        accessorKey: 'group',
        header: 'Group',
        cell: (c) => {
          const g = c.getValue<string | null>();
          return g ? <Badge tone={GROUP_TONE[g]}>{GROUP_LABEL[g]}</Badge> : '—';
        },
      },
      {
        accessorKey: 'action',
        header: 'Decision',
        cell: (c) => {
          const a = c.getValue<string | null>();
          return a ? <Badge tone={ACTION_TONE[a]}>{ACTION_LABEL[a]}</Badge> : '—';
        },
      },
      {
        accessorKey: 'gain',
        header: 'Expected extra profit',
        cell: (c) => (c.getValue() == null ? '—' : inr(c.getValue<number>(), 2)),
      },
      { accessorKey: 'channel', header: 'Channel', cell: (c) => CHANNEL_LABEL[c.getValue<string>()] ?? '—' },
      {
        accessorKey: 'text',
        header: 'Message',
        enableSorting: false,
        cell: ({ row }) => (
          <EditableMessage
            row={row.original}
            runId={runId}
            locked={!editable || row.original.sent}
            onSaved={(t) => setRows((rs) => rs.map((r) => (r.order_id === row.original.order_id ? { ...r, text: t, edited: true } : r)))}
          />
        ),
      },
      {
        accessorKey: 'status',
        header: 'What happened',
        cell: ({ row }) => <Badge tone={row.original.status_tone}>{row.original.status}</Badge>,
      },
      {
        id: 'inspect',
        header: '',
        cell: ({ row }) => (
          <a href={`/inspector?run=${runId}&order=${row.original.order_id}`} target="_blank" className="text-[12px] font-medium text-rzp hover:underline">
            Why? ↗
          </a>
        ),
      },
    ],
    [runId, editable],
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getRowId: (r) => String(r.order_id),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  });

  const sel = (value: string, set: (v: string) => void, opts: [string, string][], label: string) => (
    <label className="flex items-center gap-1.5 text-[12px] text-ink-faint">
      {label}
      <select
        className="input py-1 text-[12px]"
        value={value}
        onChange={(e) => {
          set(e.target.value);
          table.setPageIndex(0);
        }}
      >
        <option value="">All</option>
        {opts.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center gap-4 border-b border-line px-4 py-3">
        <h2>Orders in this campaign</h2>
        {sel(action, setAction, [['none', 'No message'], ['nudge', 'Reminder'], ['discount', '₹50 off offer']], 'Decision')}
        {sel(group, setGroup, [['model', 'AI-picked'], ['holdout', 'Control group'], ['explore', 'Random test']], 'Group')}
        {sel(status, setStatus, statuses.map((s) => [s, s] as [string, string]), 'What happened')}
        <span className="ml-auto text-[12px] text-ink-faint">
          {num(filtered.length)} of {num(rows.length)} orders
        </span>
      </div>
      <div className="overflow-auto">
        <table className="table-base">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th key={h.id} onClick={h.column.getCanSort() ? h.column.getToggleSortingHandler() : undefined} className={h.column.getCanSort() ? 'cursor-pointer select-none' : ''}>
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {(({ asc: ' ↑', desc: ' ↓' }) as Record<string, string>)[String(h.column.getIsSorted())] ?? ''}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between px-4 py-2.5 text-[12px] text-ink-soft">
        <span>
          Page {table.getState().pagination.pageIndex + 1} of {Math.max(1, table.getPageCount())}
        </span>
        <div className="flex gap-2">
          <button className="btn btn-sm" disabled={!table.getCanPreviousPage()} onClick={() => table.previousPage()}>
            Previous
          </button>
          <button className="btn btn-sm" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

interface Summary {
  to_message: number;
  nudges: number;
  discounts: number;
  discount_exposure: number;
  whatsapp: number;
  mobile_inbox: number;
  holdout: number;
  rejected: number;
  skipped: number;
}

/** One button: Approve & send → pop-up summary → Confirm. Analysts can request approval instead. */
export function ApproveSend({ runId, name }: { runId: number; name: string }) {
  const { state, toast, refreshState } = useLive();
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const owner = state?.role === 'owner';

  if (!owner) {
    return (
      <button
        className="btn btn-primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await api(`/api/runs/${runId}/request-approval`, { method: 'POST' });
            toast('Approval requested. The Owner has been notified.', 'success');
          } catch (e) {
            toast(e instanceof Error ? e.message : 'Failed', 'error');
          } finally {
            setBusy(false);
          }
        }}
      >
        Request approval
      </button>
    );
  }

  return (
    <>
      <button
        className="btn btn-primary px-5"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            setSummary(await api<Summary>(`/api/runs/${runId}/summary`));
          } catch (e) {
            toast(e instanceof Error ? e.message : 'Failed', 'error');
          } finally {
            setBusy(false);
          }
        }}
      >
        Approve &amp; send
      </button>
      {summary && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-6" onClick={() => !busy && setSummary(null)}>
          <div className="w-full max-w-[560px] rounded-2xl bg-white p-6 shadow-pop" onClick={(e) => e.stopPropagation()}>
            <div className="label">Confirm send</div>
            <h2 className="mt-1 text-[18px]">{name}</h2>
            <p className="mt-1 text-[13px] text-ink-soft">
              Messages go to each customer on their preferred channel with a one-tap pay-online link. Sending is simulated in this prototype.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {[
                ['Orders to message', num(summary.to_message), `${num(summary.nudges)} reminders · ${num(summary.discounts)} ₹50 off offers`],
                ['Discount exposure', inr(summary.discount_exposure), 'only if every offer is taken'],
                ['Channels', `${num(summary.whatsapp)} / ${num(summary.mobile_inbox)}`, 'WhatsApp / mobile inbox'],
                ['Control group', num(summary.holdout), 'get no message, so we can measure the lift'],
              ].map(([l, v, s]) => (
                <div key={l} className="rounded-xl border border-line px-4 py-3">
                  <div className="label">{l}</div>
                  <div className="metric-sm mt-1">{v}</div>
                  <div className="mt-0.5 text-[11.5px] text-ink-faint">{s}</div>
                </div>
              ))}
            </div>
            {summary.skipped > 0 && (
              <p className="mt-3 rounded-lg bg-warn-soft px-3 py-2 text-[12px] text-warn">
                {num(summary.skipped)} orders are skipped: the customer already paid online, or the order is past dispatch.
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn" disabled={busy} onClick={() => setSummary(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary px-5"
                disabled={busy || summary.to_message === 0}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const r = await api<{ sent: number }>(`/api/runs/${runId}/approve`, { method: 'POST' });
                    toast(`Sent ${num(r.sent)} messages. Customer responses will appear here over the next few minutes.`, 'success');
                    setSummary(null);
                    await refreshState();
                    router.refresh();
                  } catch (e) {
                    toast(e instanceof Error ? e.message : 'Send failed', 'error');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? 'Sending…' : `Confirm and send ${num(summary.to_message)} messages`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
