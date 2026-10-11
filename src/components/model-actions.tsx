'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MODEL_NAME } from '@/lib/model-labels';
import { api, useLive } from './live';

export function RetrainButton({ recommended }: { recommended: boolean }) {
  const { toast } = useLive();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [step, setStep] = useState<{ step: number; total: number; trained?: string } | null>(null);
  const run = async () => {
    setConfirming(false);
    try {
      await api('/api/model/retrain', { method: 'POST', json: { action: 'start' } });
      setStep({ step: 0, total: 9 });
      for (let i = 0; i < 20; i++) {
        const r = await api<{ status: string; step?: number; total?: number; trained?: string; version?: number }>('/api/model/retrain', {
          method: 'POST',
          json: { action: 'step' },
        });
        if (r.status === 'done') {
          toast(`Model v${r.version} is trained. Compare it with the current model, then switch if it's better.`, 'success');
          break;
        }
        if (r.status === 'idle') break;
        setStep({ step: r.step ?? 0, total: r.total ?? 9, trained: r.trained });
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Training failed', 'error');
    } finally {
      setStep(null);
      router.refresh();
    }
  };
  if (step) {
    return (
      <div className="w-72">
        <div className="mb-1 flex justify-between text-[12px] text-ink-soft">
          <span>Training {step.trained ? `· ${MODEL_NAME[step.trained] ?? step.trained}` : '…'}</span>
          <span>
            {step.step}/{step.total}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-panel">
          <div className="h-full rounded-full bg-rzp transition-all" style={{ width: `${Math.max(4, (100 * step.step) / step.total)}%` }} />
        </div>
      </div>
    );
  }
  if (confirming) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-rzp/30 bg-rzp-faint px-3 py-2 text-[12.5px]">
        Train a new version on all learning examples so far? The current model keeps running until you switch.
        <button className="btn btn-sm btn-primary" onClick={run}>
          Train
        </button>
        <button className="btn btn-sm" onClick={() => setConfirming(false)}>
          Cancel
        </button>
      </div>
    );
  }
  return (
    <button className={`btn ${recommended ? 'btn-primary' : ''}`} onClick={() => setConfirming(true)}>
      {recommended ? 'Retrain now' : 'Retrain model'}
    </button>
  );
}

export function PromoteButton({ version }: { version: number }) {
  const { state, toast } = useLive();
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  if (state?.role !== 'owner') return <span className="text-[12px] text-ink-faint">Only the Owner can switch models</span>;
  if (!confirming)
    return (
      <button className="btn btn-primary btn-sm" onClick={() => setConfirming(true)}>
        Switch to v{version}
      </button>
    );
  return (
    <span className="flex items-center gap-2 text-[12px]">
      Use v{version} for all new campaigns?
      <button
        className="btn btn-sm btn-primary"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await api('/api/model/promote', { method: 'POST', json: { version } });
            toast(`Model v${version} is now active for new campaigns.`, 'success');
            router.refresh();
          } catch (e) {
            toast(e instanceof Error ? e.message : 'Failed', 'error');
          } finally {
            setBusy(false);
            setConfirming(false);
          }
        }}
      >
        Confirm
      </button>
      <button className="btn btn-sm" onClick={() => setConfirming(false)}>
        Cancel
      </button>
    </span>
  );
}
