import Link from 'next/link';
import { ConceptLabel } from '@/components/shell';

export const dynamic = 'force-dynamic';

export default function InspectorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="flex h-12 items-center gap-3 border-b border-line bg-ink px-5 text-white">
        <span className="font-mono text-sm font-semibold">Decision Inspector</span>
        <span className="text-xs text-white/60">Verdant Daily</span>
        <div className="ml-auto flex items-center gap-3">
          <ConceptLabel />
          <Link href="/" className="text-xs text-white/70 hover:text-white">
            ← Dashboard
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-5">{children}</main>
      <footer className="px-5 pb-4 text-2xs text-ink-faint">Powered by Razorpay · all numbers are simulated</footer>
    </div>
  );
}
