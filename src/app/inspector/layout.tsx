import Link from 'next/link';
import { ConceptLabel, BrandMark, PoweredByRazorpay } from '@/components/logos';

export const dynamic = 'force-dynamic';

export default function InspectorLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-canvas">
      <header className="flex h-14 items-center gap-3 bg-rzp-navy px-6 text-white">
        <BrandMark size={26} />
        <span className="text-[14px] font-semibold">Decision Inspector</span>
        <span className="text-[12px] text-white/55">Why the AI chose what it did for one order, in plain numbers</span>
        <div className="ml-auto flex items-center gap-4">
          <ConceptLabel />
          <Link href="/" className="text-[12.5px] text-white/70 hover:text-white">
            ← Dashboard
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-6">{children}</main>
      <footer className="flex justify-between px-6 pb-5 text-[11px] text-ink-faint">
        <span>All numbers are simulated</span>
        <PoweredByRazorpay />
      </footer>
    </div>
  );
}
