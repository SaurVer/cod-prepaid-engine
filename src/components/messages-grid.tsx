'use client';

import {
  type ColumnDef,
  type RowSelectionState,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ACTION_LABEL, CHANNEL_LABEL, GROUP_LABEL, inr, num, orderCode, simDate } from '@/lib/format';
import type { MessageRow } from '@/lib/server/messages.ts';
import { api, useLive } from './live';

interface RunOpt {
  id: number;
  status: string;
  order_count: number;
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

const Tick = ({ on }: { on: boolean }) => (on ? <span className="text-brand-600">●</span> : <span className="text-gray-300">○</span>);

function Badge({ children, tone }: { children: React.ReactNode; tone: string }) {
  return <span className={`pill ${tone}`}>{children}</span>;
}

const GROUP_TONE: Record<string, string> = {
  model: 'bg-brand-100 text-brand-700',
  holdout: 'bg-gray-100 text-ink-soft',
  explore: 'bg-amber-100 text-amber-800',
};
const ACTION_TONE: Record<string, string> = {
  none: 'bg-gray-100 text-ink-soft',
  nudge: 'bg-sky-100 text-sky-800',
  discount: 'bg-violet-100 text-violet-800',
};

function EditableMessage({ row, runId, locked, onSaved }: { row: MessageRow; runId: number; locked: boolean; onSaved: (t: string) => void }) {
  const { toast } = useLive();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(row.text ?? '');
  const [saving, setSaving] = useState(false);
  if (!row.text) return <span className="text-ink-faint">—</span>;
  if (!editing) {
    return (
      <button
        className={`block max-w-[360px] truncate text-left ${locked ? 'cursor-default' : 'hover:text-rzp'}`}
        title={locked ? row.text : 'Click to edit'}
        onClick={() => {
          if (locked) return;
          setDraft(row.text ?? '');
          setEditing(true);
        }}
      >
        {row.edited && <span className="mr-1 text-2xs font-semibold text-rzp">EDITED</span>}
        {row.text}
      </button>
    );
  }
  const save = async () => {
    setSaving(true);
    try {
      await api('/api/messages', { method: 'PATCH', json: { runId, orderId: row.order_id, text: draft } });
      onSaved(draft.trim());
      setEditing(false);
      toast('Message saved. The edit is logged.', 'info');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Save failed', 'error');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="w-[360px] whitespace-normal">
      <textarea
        className="input h-24 w-full text-xs"
        value={draft}
        maxLength={300}
        autoFocus
        onChange={(e) => setDraft(e.target.value)}
      />
      <div className="mt-1 flex items-center gap-2">
        <button className="btn btn-sm btn-brand" disabled={saving} onClick={save}>
          Save
        </button>
        <button className="btn btn-sm" disabled={saving} onClick={() => setEditing(false)}>
          Cancel
        </button>
        <span className={`ml-auto text-2xs ${draft.length > 300 ? 'text-red-700' : 'text-ink-faint'}`}>{draft.length}/300</span>
      </div>
    </div>
  );
}

export function MessagesGrid({
  runId,
  runStatus,
  runs,
  rows: initialRows,
  initialFilters,
}: {
  runId: number;
  runStatus: string;
  runs: RunOpt[];
  rows: MessageRow[];
  initialFilters: Record<string, string>;
}) {
  const router = useRouter();
  const { state, toast, refreshState } = useLive();
  const [rows, setRows] = useState(initialRows);
  useEffect(() => setRows(initialRows), [initialRows]);
  const [filters, setFilters] = useState<Record<string, string>>({
    group: initialFilters.group ?? '',
    action: initialFilters.action ?? '',
    channel: '',
    status: '',
    resend: '',
  });
  const [selection, setSelection] = useState<RowSelectionState>({});
  const [sorting, setSorting] = useState<SortingState>([]);
  const [panel, setPanel] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);
  const owner = state?.role === 'owner';
  const reviewable = runStatus === 'ready_for_review';

  const filtered = useMemo(
    () =>
      rows.filter((r) => {
        if (filters.group && r.group !== filters.group) return false;
        if (filters.action && r.action !== filters.action) return false;
        if (filters.channel && r.channel !== filters.channel) return false;
        if (filters.resend === 'yes' && !r.is_resend) return false;
        if (filters.resend === 'no' && r.is_resend) return false;
        if (filters.status) {
          const s = filters.status;
          if (s === 'pending' && (r.review !== 'pending' || r.sent)) return false;
          if (s === 'approved' && r.review !== 'approved') return false;
          if (s === 'rejected' && r.review !== 'rejected') return false;
          if (s === 'sent' && !r.sent) return false;
          if (s === 'converted' && !r.converted) return false;
          if (s === 'no_message' && r.text) return false;
        }
        return true;
      }),
    [rows, filters],
  );

  const columns = useMemo<ColumnDef<MessageRow>[]>(
    () => [
      {
        id: 'select',
        header: ({ table }) => (
          <input
            type="checkbox"
            className="accent-brand-600"
            checked={table.getIsAllRowsSelected()}
            onChange={table.getToggleAllRowsSelectedHandler()}
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            className="accent-brand-600"
            disabled={!row.getCanSelect()}
            checked={row.getIsSelected()}
            onChange={row.getToggleSelectedHandler()}
          />
        ),
      },
      {
        accessorKey: 'order_id',
        header: 'Order',
        cell: (c) => <span className="font-mono">{orderCode(c.getValue<number>())}</span>,
      },
      { accessorKey: 'customer_id', header: 'Customer', cell: (c) => <span className="font-mono text-ink-soft">C{c.getValue<number>()}</span> },
      { accessorKey: 'value', header: 'Value', cell: (c) => inr(c.getValue<number>()) },
      { accessorKey: 'batch_id', header: 'Batch', cell: (c) => simDate(c.getValue<string>()) },
      {
        accessorKey: 'group',
        header: 'Group',
        cell: (c) => {
          const g = c.getValue<string | null>();
          return g ? <Badge tone={GROUP_TONE[g]}>{GROUP_LABEL[g]}</Badge> : '—';
        },
      },
      {
        id: 'sends',
        header: 'Resend · sends',
        accessorFn: (r) => r.send_count,
        cell: ({ row }) => (
          <span>
            {row.original.is_resend ? <Badge tone="bg-orange-100 text-orange-800">Resend</Badge> : <span className="text-ink-faint">—</span>}{' '}
            <span className="text-ink-soft">{row.original.send_count}</span>
          </span>
        ),
      },
      {
        accessorKey: 'action',
        header: 'Action',
        cell: (c) => {
          const a = c.getValue<string | null>();
          return a ? <Badge tone={ACTION_TONE[a]}>{ACTION_LABEL[a]}</Badge> : '—';
        },
      },
      { accessorKey: 'discount', header: 'Discount', cell: (c) => (c.getValue<number>() ? inr(c.getValue<number>()) : '—') },
      { accessorKey: 'gain', header: 'Exp. gain', cell: (c) => (c.getValue() == null ? '—' : inr(c.getValue<number>(), 2)) },
      { accessorKey: 'channel', header: 'Channel', cell: (c) => CHANNEL_LABEL[c.getValue<string>()] ?? '—' },
      {
        accessorKey: 'consent',
        header: 'Consent',
        cell: (c) => (c.getValue<boolean>() ? <span className="text-brand-700">Consented</span> : <span className="text-red-700">No</span>),
      },
      {
        accessorKey: 'text',
        header: 'Message',
        enableSorting: false,
        cell: ({ row }) => (
          <EditableMessage
            row={row.original}
            runId={runId}
            locked={!reviewable || row.original.sent}
            onSaved={(t) =>
              setRows((rs) => rs.map((r) => (r.order_id === row.original.order_id ? { ...r, text: t, edited: true } : r)))
            }
          />
        ),
      },
      { accessorKey: 'variant', header: 'Variant', cell: (c) => c.getValue<string>() ?? '—' },
      {
        accessorKey: 'fallback',
        header: 'Fallback',
        cell: (c) => (c.getValue() == null ? '—' : c.getValue<boolean>() ? <span className="text-amber-700">Yes</span> : 'No'),
      },
      {
        id: 'status',
        header: 'Send status',
        accessorFn: (r) => (r.sent ? 'sent' : r.review ?? ''),
        cell: ({ row }) => {
          const r = row.original;
          if (r.sent) return <Badge tone="bg-brand-100 text-brand-700">{r.delivered ? 'Delivered' : 'Sent'}</Badge>;
          if (!r.text) return <span className="text-ink-faint">No message</span>;
          if (r.review === 'rejected') return <Badge tone="bg-red-100 text-red-700">Rejected</Badge>;
          if (r.review === 'approved') return <Badge tone="bg-sky-100 text-sky-800">Approved</Badge>;
          return <Badge tone="bg-gray-100 text-ink-soft">Pending review</Badge>;
        },
      },
      { accessorKey: 'opened', header: 'Opened', cell: (c) => <Tick on={c.getValue<boolean>()} /> },
      { accessorKey: 'clicked', header: 'Clicked', cell: (c) => <Tick on={c.getValue<boolean>()} /> },
      {
        accessorKey: 'converted',
        header: 'Converted',
        cell: ({ row }) =>
          row.original.converted ? (
            <span className="text-brand-700">Yes{row.original.converted_via === 'organic' ? ' (self)' : ''}</span>
          ) : (
            <span className="text-ink-faint">—</span>
          ),
      },
      {
        accessorKey: 'outcome',
        header: 'Final outcome',
        cell: (c) => {
          const o = c.getValue<string | null>();
          if (!o) return <span className="text-ink-faint">Pending</span>;
          return <span className={o === 'rto' ? 'text-red-700' : o === 'cancelled' ? 'text-amber-700' : 'text-brand-700'}>{o === 'rto' ? 'RTO' : o[0].toUpperCase() + o.slice(1)}</span>;
        },
      },
      {
        id: 'inspect',
        header: '',
        cell: ({ row }) => (
          <Link href={`/inspector?run=${runId}&order=${row.original.order_id}`} className="text-2xs font-medium text-rzp hover:underline" target="_blank">
            Open in Inspector
          </Link>
        ),
      },
    ],
    [runId, reviewable],
  );

  const table = useReactTable({
    data: filtered,
    columns,
    state: { rowSelection: selection, sorting },
    enableRowSelection: (row) => reviewable && !!row.original.text && !row.original.sent,
    onRowSelectionChange: setSelection,
    onSortingChange: setSorting,
    getRowId: (r) => String(r.order_id),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 50 } },
  });

  const selectedIds = Object.keys(selection).filter((k) => selection[k]).map(Number);

  const review = async (value: 'approved' | 'rejected') => {
    setBusy(true);
    try {
      const r = await api<{ updated: number }>('/api/messages/review', {
        method: 'POST',
        json: { runId, orderIds: selectedIds, review: value },
      });
      setRows((rs) => rs.map((x) => (selectedIds.includes(x.order_id) && !x.sent ? { ...x, review: value } : x)));
      setSelection({});
      toast(`${r.updated} message${r.updated === 1 ? '' : 's'} ${value}.`, 'info');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const openPanel = async () => {
    setBusy(true);
    try {
      setPanel(await api<Summary>(`/api/runs/${runId}/summary`));
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    setBusy(true);
    try {
      const r = await api<{ sent: number }>(`/api/runs/${runId}/approve`, { method: 'POST' });
      toast(`Run #${runId} approved: ${r.sent.toLocaleString('en-IN')} messages sent (simulated).`, 'success', `/results?run=${runId}`);
      setPanel(null);
      await refreshState();
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Send failed', 'error');
    } finally {
      setBusy(false);
    }
  };

  const setF = (k: string, v: string) => {
    setFilters((f) => ({ ...f, [k]: v }));
    table.setPageIndex(0);
  };

  return (
    <div className="space-y-3">
      <div className="card flex flex-wrap items-end gap-3 px-3 py-2.5">
        <label className="text-xs">
          <div className="label">Run</div>
          <select className="input mt-0.5 py-1 text-xs" value={runId} onChange={(e) => router.push(`/messages?run=${e.target.value}`)}>
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                #{r.id} · {r.status.replace(/_/g, ' ')} · {num(r.order_count)} orders
              </option>
            ))}
          </select>
        </label>
        {(
          [
            ['group', 'Group', [['model', 'Model'], ['holdout', 'Holdout'], ['explore', 'Explore']]],
            ['action', 'Action', [['none', 'No action'], ['nudge', 'Nudge'], ['discount', 'Discount']]],
            ['channel', 'Channel', [['whatsapp', 'WhatsApp'], ['mobile_inbox', 'Mobile inbox']]],
            ['status', 'Status', [['pending', 'Pending review'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['sent', 'Sent'], ['converted', 'Converted'], ['no_message', 'No message']]],
            ['resend', 'Resend', [['yes', 'Resends'], ['no', 'First sends']]],
          ] as [string, string, [string, string][]][]
        ).map(([k, label, opts]) => (
          <label key={k} className="text-xs">
            <div className="label">{label}</div>
            <select className="input mt-0.5 py-1 text-xs" value={filters[k]} onChange={(e) => setF(k, e.target.value)}>
              <option value="">All</option>
              {opts.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        ))}
        <div className="ml-auto text-xs text-ink-faint">
          {num(filtered.length)} of {num(rows.length)} orders
        </div>
      </div>

      {reviewable && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink-soft">{selectedIds.length} selected</span>
          <button className="btn btn-sm" disabled={!selectedIds.length || busy} onClick={() => review('approved')}>
            Approve selected
          </button>
          <button className="btn btn-sm btn-danger" disabled={!selectedIds.length || busy} onClick={() => review('rejected')}>
            Reject selected
          </button>
          <div className="ml-auto flex items-center gap-2">
            {owner ? (
              <button className="btn btn-primary" disabled={busy} onClick={openPanel}>
                Approve &amp; send
              </button>
            ) : (
              <span className="text-xs text-ink-faint">Only the Owner can approve &amp; send. Switch role in the top bar.</span>
            )}
          </div>
        </div>
      )}

      {panel && (
        <div className="rounded-lg border border-rzp/40 bg-rzp-soft p-4">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-sm font-semibold">Approve &amp; send run #{runId}</div>
              <div className="text-xs text-ink-soft">Messages go out on each customer&apos;s preferred consented channel. Sending is simulated.</div>
            </div>
            <button className="text-xs text-ink-faint hover:text-ink" onClick={() => setPanel(null)}>
              Close
            </button>
          </div>
          <div className="mt-3 grid grid-cols-5 gap-3 text-sm">
            <div><div className="label">Orders to message</div><div className="text-lg font-semibold">{num(panel.to_message)}</div><div className="text-2xs text-ink-faint">{num(panel.nudges)} nudges · {num(panel.discounts)} discounts</div></div>
            <div><div className="label">Total discount exposure</div><div className="text-lg font-semibold">{inr(panel.discount_exposure)}</div><div className="text-2xs text-ink-faint">if every discount converts</div></div>
            <div><div className="label">Channel split</div><div className="text-lg font-semibold">{num(panel.whatsapp)} / {num(panel.mobile_inbox)}</div><div className="text-2xs text-ink-faint">WhatsApp / mobile inbox</div></div>
            <div><div className="label">Holdout size</div><div className="text-lg font-semibold">{num(panel.holdout)}</div><div className="text-2xs text-ink-faint">no message, for measurement</div></div>
            <div><div className="label">Not sent</div><div className="text-lg font-semibold">{num(panel.rejected + panel.skipped)}</div><div className="text-2xs text-ink-faint">{num(panel.rejected)} rejected · {num(panel.skipped)} converted or past dispatch</div></div>
          </div>
          <div className="mt-3 flex gap-2">
            <button className="btn btn-primary" disabled={busy || !panel.to_message} onClick={send}>
              {busy ? 'Sending…' : `Confirm: send ${num(panel.to_message)} messages`}
            </button>
            <button className="btn" disabled={busy} onClick={() => setPanel(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="card overflow-auto">
        <table className="table-base">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    onClick={h.column.getCanSort() ? h.column.getToggleSortingHandler() : undefined}
                    className={h.column.getCanSort() ? 'cursor-pointer select-none' : ''}
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {(({ asc: ' ▲', desc: ' ▼' }) as Record<string, string>)[String(h.column.getIsSorted())] ?? ''}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className={row.getIsSelected() ? 'bg-brand-50' : ''}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between text-xs text-ink-soft">
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
