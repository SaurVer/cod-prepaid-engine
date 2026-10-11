'use client';

// Overview banner: a looping, wordless animation of one COD order turning prepaid
// (order on COD → WhatsApp reminder → tap → Razorpay Checkout → UPI → paid). Pure CSS + state.

import { useEffect, useState } from 'react';

// step: 0 order · 1 message arrives · 2 tap link · 3 checkout · 4 choose UPI app · 5 tap pay · 6 processing · 7 success
const DUR = [1800, 1700, 900, 1300, 1100, 800, 1000, 2200];
// finger position (% of screen) per step, null = hidden
const FINGER: (null | [number, number])[] = [null, null, [50, 43], null, [24, 37], [50, 88], null, null];

const Brand = ({ s = 22 }: { s?: number }) => (
  <span className="flex shrink-0 items-center justify-center rounded-full bg-[#1F3B33] text-[#F3DFAE]" style={{ width: s, height: s, fontSize: s * 0.5 }}>
    ✦
  </span>
);

function Screens({ step }: { step: number }) {
  const show = (from: number, to: number) =>
    `absolute inset-0 flex flex-col transition-all duration-500 ${step >= from && step <= to ? 'opacity-100 translate-x-0' : step > to ? 'pointer-events-none -translate-x-6 opacity-0' : 'pointer-events-none translate-x-6 opacity-0'}`;
  return (
    <>
      {/* order placed, COD */}
      <div className={`${show(0, 0)} items-center justify-center bg-white px-4 text-center`}>
        <Brand s={34} />
        <div className="mt-2 text-[12px] font-semibold">Order confirmed</div>
        <div className="text-[9.5px] text-ink-faint">Elvora · EV-084300</div>
        <div className="mt-3 w-full space-y-1 rounded-lg bg-panel p-2 text-left text-[9.5px]">
          <div className="flex justify-between"><span>Vitamin C serum</span><span>₹1,310</span></div>
          <div className="flex justify-between font-semibold"><span>Payment</span><span className="text-warn">Cash on delivery</span></div>
        </div>
      </div>

      {/* WhatsApp chat */}
      <div className={`${show(1, 2)} bg-[#ECE5DD]`}>
        <div className="flex items-center gap-1.5 bg-[#075E54] px-3 pb-2 pt-6 text-[11px] font-semibold text-white">
          <Brand s={20} /> Elvora
        </div>
        <div className="px-2.5 py-3">
          <div className={`max-w-[94%] rounded-lg rounded-tl-none bg-white p-2 text-[9.5px] leading-snug shadow-sm transition-all duration-500 ${step >= 1 ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0'}`}>
            Hi Priya, your Elvora order is packed. Pay ₹1,310 online now and skip the cash at your door.
            <div className={`mt-2 rounded-md py-1.5 text-center text-[10px] font-semibold transition-colors ${step === 2 ? 'bg-[#075E54] text-white' : 'bg-[#E7F6EF] text-[#075E54]'}`}>
              Pay online
            </div>
            <div className="mt-0.5 text-right text-[8px] text-ink-faint">9:00 PM</div>
          </div>
        </div>
      </div>

      {/* Razorpay Checkout */}
      <div className={`${show(3, 6)} bg-[#F5F7FB]`}>
        <div className="bg-[#0F1E3A] px-3 pb-3 pt-6 text-white">
          <div className="flex items-center gap-1.5">
            <Brand s={18} />
            <span className="text-[10.5px] font-semibold">Elvora</span>
          </div>
          <div className="mt-2 text-[16px] font-semibold tracking-tight">₹1,310</div>
        </div>
        <div className="-mt-1.5 flex-1 rounded-t-xl bg-white px-2.5 pt-2.5 text-[9.5px]">
          <div className="mb-1.5 text-[8.5px] font-semibold uppercase tracking-wide text-ink-faint">Pay with UPI</div>
          <div className="grid grid-cols-3 gap-1.5">
            {[
              ['G', '#4285F4'],
              ['Pe', '#5F259F'],
              ['P', '#00BAF2'],
            ].map(([l, c], i) => (
              <div
                key={l}
                className={`flex flex-col items-center gap-0.5 rounded-lg border py-1.5 transition-colors ${step >= 4 && i === 0 ? 'border-[#305EFF] bg-[#F0F4FF]' : 'border-line'}`}
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full text-[8px] font-bold text-white" style={{ background: c }}>
                  {l}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2.5 space-y-1">
            {['Cards', 'Netbanking', 'Wallet'].map((m) => (
              <div key={m} className="flex items-center justify-between rounded-md border border-line px-2 py-1.5 text-ink-soft">
                {m} <span className="text-ink-faint">›</span>
              </div>
            ))}
          </div>
        </div>
        <div className="bg-white px-2.5 pb-2.5">
          <div className={`flex h-8 items-center justify-center rounded-md text-[10.5px] font-semibold text-white transition-colors ${step >= 5 ? 'bg-[#2950DA]' : 'bg-[#305EFF]'}`}>
            {step === 6 ? <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" /> : 'Pay ₹1,310'}
          </div>
          <div className="mt-1 text-center text-[7.5px] text-ink-faint">Secured by Razorpay</div>
        </div>
      </div>

      {/* success */}
      <div className={`${show(7, 7)} items-center justify-center bg-white px-4 text-center`}>
        <span className={`flex h-12 w-12 items-center justify-center rounded-full bg-ok text-[22px] text-white transition-transform duration-500 ${step === 7 ? 'scale-100' : 'scale-50'}`}>✓</span>
        <div className="mt-2.5 text-[13px] font-semibold">₹1,310 paid</div>
        <div className="mt-0.5 text-[9.5px] text-ink-faint">Elvora · EV-084300</div>
        <div className="mt-3 rounded-full bg-ok-soft px-2.5 py-1 text-[9.5px] font-semibold text-ok">Prepaid</div>
      </div>
    </>
  );
}

export function HeroDemo() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setStep((s) => (s + 1) % DUR.length), DUR[step]);
    return () => clearTimeout(t);
  }, [step]);
  const f = FINGER[step];
  return (
    <section className="relative flex items-center justify-between gap-8 overflow-hidden rounded-2xl bg-rzp-navy px-10 py-5">
      <div className="pointer-events-none absolute -left-16 -top-24 h-72 w-72 rounded-full bg-rzp/35 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-28 right-10 h-72 w-72 rounded-full bg-[#7EA0FF]/20 blur-3xl" />
      <div className="relative">
        <div className="text-[22px] font-semibold leading-tight tracking-[-0.01em] text-white">COD in. Prepaid out.</div>
        <div className="mt-1 text-[13px] text-white/60">One message, one tap, paid with Razorpay.</div>
        <div className="mt-4 flex gap-1.5">
          {DUR.map((_, i) => (
            <span key={i} className={`h-1 rounded-full transition-all duration-300 ${i === step ? 'w-6 bg-white' : i < step ? 'w-2 bg-white/60' : 'w-2 bg-white/20'}`} />
          ))}
        </div>
      </div>
      <div className="relative h-[330px] w-[170px] shrink-0 rounded-[30px] border-[5px] border-[#050B17] bg-[#050B17] shadow-[0_20px_50px_rgba(0,0,0,0.45)]">
        <div className="absolute left-1/2 top-1.5 z-20 h-3.5 w-14 -translate-x-1/2 rounded-full bg-[#050B17]" />
        <div className="relative h-full overflow-hidden rounded-[25px] text-ink">
          <Screens step={step} />
          <span
            className={`pointer-events-none absolute z-30 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-white/40 shadow-lg transition-all duration-500 ${f ? 'opacity-100' : 'opacity-0'}`}
            style={{ left: `${f?.[0] ?? 50}%`, top: `${f?.[1] ?? 70}%` }}
          >
            {f && <span className="absolute inset-0 animate-ping rounded-full bg-white/60" />}
          </span>
        </div>
      </div>
    </section>
  );
}
