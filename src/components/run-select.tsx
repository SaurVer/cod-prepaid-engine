'use client';

import { useRouter } from 'next/navigation';

export function RunSelect({ base, value, runs }: { base: string; value: number; runs: { id: number; label: string }[] }) {
  const router = useRouter();
  return (
    <select className="input py-1 text-xs" value={value} onChange={(e) => router.push(`${base}?run=${e.target.value}`)}>
      {runs.map((r) => (
        <option key={r.id} value={r.id}>
          {r.label}
        </option>
      ))}
    </select>
  );
}
