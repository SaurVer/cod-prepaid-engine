'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api, useLive } from './live';

interface Field {
  key: string;
  label: string;
  hint: string;
  prefix?: string;
  suffix?: string;
  scale?: number;
}

export function SettingsForm({ title, fields, values }: { title: string; fields: Field[]; values: Record<string, number> }) {
  const { state, toast } = useLive();
  const router = useRouter();
  const owner = state?.role === 'owner';
  const [form, setForm] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((f) => [f.key, String(Number(values[f.key]) * (f.scale ?? 1))])),
  );
  const [busy, setBusy] = useState(false);
  return (
    <div className="card px-5 py-4">
      <h2>{title}</h2>
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3">
        {fields.map((f) => (
          <label key={f.key} className="block">
            <div className="text-[12.5px] font-medium">{f.label}</div>
            <div className="mt-1 flex items-center gap-1.5">
              {f.prefix && <span className="text-ink-faint">{f.prefix}</span>}
              <input
                className="input w-28"
                type="number"
                step="any"
                disabled={!owner}
                value={form[f.key]}
                onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
              />
              {f.suffix && <span className="text-ink-faint">{f.suffix}</span>}
            </div>
            <div className="mt-0.5 text-[11.5px] text-ink-faint">{f.hint}</div>
          </label>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <button
          className="btn btn-primary"
          disabled={!owner || busy}
          onClick={async () => {
            setBusy(true);
            try {
              const patch: Record<string, number> = {};
              for (const f of fields) patch[f.key] = Number(form[f.key]) / (f.scale ?? 1);
              await api('/api/settings', { method: 'PATCH', json: patch });
              toast('Saved. New campaigns use these settings; the change is in the audit log.', 'success');
              router.refresh();
            } catch (e) {
              toast(e instanceof Error ? e.message : 'Save failed', 'error');
            } finally {
              setBusy(false);
            }
          }}
        >
          Save
        </button>
        {!owner && <span className="text-[12px] text-ink-faint">Only the Owner can change settings.</span>}
      </div>
    </div>
  );
}

export function ProfileForm({ name, tone }: { name: string; tone: string }) {
  const { state, toast } = useLive();
  const router = useRouter();
  const owner = state?.role === 'owner';
  const [n, setN] = useState(name);
  const [t, setT] = useState(tone);
  return (
    <div className="card px-5 py-4">
      <h2>Brand</h2>
      <label className="mt-3 block">
        <div className="text-[12.5px] font-medium">Brand name</div>
        <input className="input mt-1 w-64" value={n} disabled={!owner} onChange={(e) => setN(e.target.value)} />
      </label>
      <label className="mt-3 block">
        <div className="text-[12.5px] font-medium">Tone of voice for AI messages</div>
        <textarea className="input mt-1 h-20 w-full" value={t} disabled={!owner} onChange={(e) => setT(e.target.value)} />
      </label>
      <button
        className="btn btn-primary mt-3"
        disabled={!owner}
        onClick={async () => {
          try {
            await api('/api/settings', { method: 'PATCH', json: { name: n, tone_guide: t } });
            toast('Brand settings saved.', 'success');
            router.refresh();
          } catch (e) {
            toast(e instanceof Error ? e.message : 'Save failed', 'error');
          }
        }}
      >
        Save
      </button>
    </div>
  );
}

export function IntegrationToggle({ k, on }: { k: string; on: boolean }) {
  const { state, toast } = useLive();
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const owner = state?.role === 'owner';
  const flip = async (value: boolean) => {
    try {
      await api('/api/integrations', { method: 'PATCH', json: { key: k, consent: value } });
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Failed', 'error');
    }
    setConfirm(false);
  };
  if (confirm)
    return (
      <span className="flex items-center gap-2 text-[12px]">
        Share this data with Razorpay for COD decisions?
        <button className="btn btn-sm btn-primary" onClick={() => flip(true)}>
          Allow
        </button>
        <button className="btn btn-sm" onClick={() => setConfirm(false)}>
          Cancel
        </button>
      </span>
    );
  return (
    <button
      disabled={!owner}
      onClick={() => (on ? flip(false) : setConfirm(true))}
      className={`relative h-5 w-9 rounded-full transition-colors ${on ? 'bg-rzp' : 'bg-line'} disabled:opacity-50`}
      aria-label={on ? 'Disconnect' : 'Connect'}
    >
      <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  );
}
