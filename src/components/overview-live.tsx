'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { simDate } from '@/lib/format';
import { useLive } from './live';

/** "New batch arrived" marker when a batch lands while the user is on the page. */
export function NewBatchMarker({ initialBatch }: { initialBatch: string | null }) {
  const { state } = useLive();
  const [arrived, setArrived] = useState<string | null>(null);
  const latest = state?.latest_batch?.id ?? null;
  useEffect(() => {
    if (latest && initialBatch && latest !== initialBatch) {
      setArrived(latest);
      const t = setTimeout(() => setArrived(null), 90_000);
      return () => clearTimeout(t);
    }
  }, [latest, initialBatch]);
  if (!arrived) return null;
  return (
    <span className="pill animate-pulse border border-rzp/30 bg-rzp-soft text-rzp">
      New batch arrived · {simDate(arrived)} · {state?.latest_batch?.total_orders.toLocaleString('en-IN')} orders
    </span>
  );
}

export function CreateRunButton() {
  return (
    <Link href="/runs/new" className="btn btn-primary">
      Create run
    </Link>
  );
}
