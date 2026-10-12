'use client';

// Overview banner: a wordless, looping "video" of one COD order turning prepaid.
// Lock screen → WhatsApp notification → chat → tap "Pay online" → Razorpay Checkout → UPI → Pay → paid.
// Every screen is laid out in fixed pixels so the tap pointer lands exactly on its target.

import { useEffect, useState } from 'react';

const W = 190; // screen width (px)
const H = 392; // screen height (px)

// [duration ms, pointer target or null]
const STEPS: [number, [number, number] | null][] = [
  [900, null], // 0 lock screen
  [1200, null], // 1 notification drops in
  [800, [95, 150]], // 2 tap notification
  [1300, null], // 3 chat
  [800, [88, 181]], // 4 tap "Pay online"
  [700, null], // 5 checkout loading
  [700, null], // 6 checkout ready
  [800, [37, 146]], // 7 tap GPay
  [800, [95, 343]], // 8 tap Pay
  [1100, null], // 9 processing
  [2200, null], // 10 success
];

function Mark({ s }: { s: number }) {
  return (
    <span className="flex shrink-0 items-center justify-center rounded-full bg-[#1F3B33] text-[#F3DFAE]" style={{ width: s, height: s, fontSize: s * 0.55 }}>
      ✦
    </span>
  );
}

function StatusBar({ dark = false }: { dark?: boolean }) {
  return (
    <div className={`flex h-5 items-center justify-between px-4 text-[8px] font-semibold ${dark ? 'text-white' : 'text-ink'}`}>
      <span>9:00</span>
      <span className="tracking-tighter">●●● ▮</span>
    </div>
  );
}

function Layer({ on, children, className = '' }: { on: boolean; children: React.ReactNode; className?: string }) {
  return (
    <div className={`absolute inset-0 transition-all duration-500 ease-out ${on ? 'scale-100 opacity-100' : 'pointer-events-none scale-[0.97] opacity-0'} ${className}`}>
      {children}
    </div>
  );
}

function Screen({ step }: { step: number }) {
  const checkoutReady = step >= 6;
  return (
    <div className="relative overflow-hidden rounded-[26px] bg-black text-ink" style={{ width: W, height: H }}>
      {/* Lock screen with notification */}
      <Layer on={step <= 2} className="bg-gradient-to-b from-[#1B2A4E] via-[#24345F] to-[#3A2F5B]">
        <StatusBar dark />
        <div className="mt-6 text-center text-white">
          <div className="text-[44px] font-light leading-none tracking-tight">9:00</div>
          <div className="mt-1 text-[10px] text-white/70">Monday, 12 October</div>
        </div>
        <div
          className={`absolute left-2.5 right-2.5 top-[118px] rounded-2xl bg-white/90 p-2.5 shadow-lg backdrop-blur transition-all duration-500 ${
            step >= 1 ? 'translate-y-0 opacity-100' : '-translate-y-6 opacity-0'
          } ${step === 2 ? 'scale-[0.97]' : ''}`}
        >
          <div className="flex items-center gap-1.5 text-[8.5px] text-ink-soft">
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded-[4px] bg-[#25D366] text-[7px] text-white">✆</span>
            WHATSAPP · now
          </div>
          <div className="mt-1 flex gap-2">
            <Mark s={22} />
            <div className="min-w-0 text-[10px] leading-snug">
              <div className="font-semibold">Elvora</div>
              <div className="truncate text-ink-soft">Pay ₹1,310 online for your order…</div>
            </div>
          </div>
        </div>
      </Layer>

      {/* WhatsApp chat */}
      <Layer on={step === 3 || step === 4} className="bg-[#EFE7DE]">
        <div className="bg-[#075E54] pb-2 text-white">
          <StatusBar dark />
          <div className="flex items-center gap-2 px-3 pt-1">
            <span className="text-[12px] opacity-80">‹</span>
            <Mark s={24} />
            <div className="leading-tight">
              <div className="text-[11px] font-semibold">Elvora</div>
              <div className="text-[8px] opacity-70">Business account</div>
            </div>
          </div>
        </div>
        <div className="absolute left-2.5 right-6 top-[70px] rounded-xl rounded-tl-sm bg-white p-2.5 shadow-sm">
          <div className="h-[78px] text-[10.5px] leading-[15px] text-ink">
            Hi Priya! Your Elvora order (₹1,310) is packed and ships tomorrow. Pay online now and skip handing over cash at the door.
          </div>
          <div
            className={`mt-2 flex h-7 items-center justify-center gap-1 rounded-lg text-[10.5px] font-semibold transition-colors duration-200 ${
              step === 4 ? 'bg-[#075E54] text-white' : 'bg-[#E3F4EC] text-[#075E54]'
            }`}
          >
            ↗ Pay online
          </div>
          <div className="mt-1 text-right text-[7.5px] text-ink-faint">9:00 PM</div>
        </div>
      </Layer>

      {/* Razorpay Checkout */}
      <Layer on={step >= 5 && step <= 9} className="bg-white">
        <div className="h-[92px] bg-gradient-to-br from-[#0B3C8C] to-[#1E66F5] text-white">
          <StatusBar dark />
          <div className="mt-1 flex items-center gap-2 px-3">
            <Mark s={26} />
            <div className="leading-tight">
              <div className="text-[11px] font-semibold">Elvora</div>
              <div className="text-[8px] opacity-75">Order EV-084300</div>
            </div>
          </div>
          <div className="mt-1.5 px-3 text-[18px] font-semibold tracking-tight">₹1,310</div>
        </div>
        <div className={`px-3 transition-opacity duration-300 ${checkoutReady ? 'opacity-100' : 'opacity-0'}`}>
          <div className="mt-2.5 text-[8.5px] font-semibold uppercase tracking-wide text-ink-faint">Pay using UPI</div>
          <div className="mt-1.5 grid grid-cols-3 gap-2">
            {[
              ['G', 'linear-gradient(135deg,#4285F4,#34A853)'],
              ['₱', '#5F259F'],
              ['P', '#00BAF2'],
            ].map(([l, bg], i) => (
              <div
                key={i}
                className={`flex h-12 items-center justify-center rounded-xl border transition-all duration-200 ${
                  step >= 7 && i === 0 ? 'border-[#1E66F5] bg-[#EEF3FF] ring-2 ring-[#1E66F5]/20' : 'border-line'
                }`}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ background: bg }}>
                  {l}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 divide-y divide-line rounded-xl border border-line text-[10px]">
            {['Cards', 'Netbanking', 'Wallet'].map((m) => (
              <div key={m} className="flex h-[34px] items-center justify-between px-2.5 text-ink-soft">
                {m}
                <span className="text-ink-faint">›</span>
              </div>
            ))}
          </div>
        </div>
        {!checkoutReady && (
          <div className="absolute inset-x-3 top-[104px] space-y-2">
            {[48, 34, 34, 34].map((h, i) => (
              <div key={i} className="animate-pulse rounded-xl bg-panel" style={{ height: h }} />
            ))}
          </div>
        )}
        <div className="absolute inset-x-3 bottom-[30px]">
          <div
            className={`flex h-[38px] items-center justify-center rounded-xl text-[11px] font-semibold text-white transition-all duration-200 ${
              step >= 8 ? 'bg-[#0B3C8C]' : 'bg-[#1E66F5]'
            } ${checkoutReady ? 'opacity-100' : 'opacity-40'}`}
          >
            {step === 9 ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" /> : 'Pay ₹1,310'}
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-2.5 text-center text-[7.5px] text-ink-faint">
          Secured by <b className="font-bold italic text-[#0B3C8C]">Razorpay</b>
        </div>
      </Layer>

      {/* Success */}
      <Layer on={step === 10} className="flex flex-col items-center justify-center bg-white">
        <svg viewBox="0 0 52 52" className="h-16 w-16">
          <circle cx="26" cy="26" r="25" fill="#00875A" className={`origin-center transition-transform duration-500 ${step === 10 ? 'scale-100' : 'scale-0'}`} />
          <path
            d="M15 27l7 7 15-16"
            fill="none"
            stroke="#fff"
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="40"
            strokeDashoffset={step === 10 ? 0 : 40}
            style={{ transition: 'stroke-dashoffset 600ms ease 250ms' }}
          />
        </svg>
        <div className="mt-3 text-[15px] font-semibold">₹1,310 paid</div>
        <div className="mt-0.5 text-[9px] text-ink-faint">via UPI · Razorpay</div>
      </Layer>

      {/* notch */}
      <div className="absolute left-1/2 top-1 z-20 h-3.5 w-16 -translate-x-1/2 rounded-full bg-black" />
    </div>
  );
}

function Pointer({ at }: { at: [number, number] | null }) {
  const [x, y] = at ?? [120, 300];
  return (
    <div
      className={`pointer-events-none absolute z-30 transition-all duration-500 ease-out ${at ? 'opacity-100' : 'opacity-0'}`}
      style={{ left: x, top: y, transform: 'translate(-9px, -2px)' }}
    >
      {at && <span className="absolute -left-3 -top-3 h-8 w-8 animate-ping rounded-full bg-white/50" />}
      <svg width="26" height="30" viewBox="0 0 26 30" className="drop-shadow-[0_3px_6px_rgba(0,0,0,0.45)]">
        <path
          d="M9 1.5c1.4 0 2.5 1.1 2.5 2.5v9.2l1-.1c1.3 0 2.3.8 2.6 1.9 1.4-.4 2.9.3 3.4 1.6 1.5-.3 3 .7 3.2 2.2l.8 5.4c.4 3-1.3 5.8-4.1 6.6l-3 .8c-2.3.6-4.8-.2-6.3-2.1L3.4 20.7c-.9-1.1-.6-2.7.6-3.4 1-.6 2.3-.4 3.1.4l-.6-.5V4c0-1.4 1.1-2.5 2.5-2.5z"
          fill="#fff"
          stroke="#0B1529"
          strokeWidth="1.2"
        />
      </svg>
    </div>
  );
}

export function HeroDemo() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setStep((s) => (s + 1) % STEPS.length), STEPS[step][0]);
    return () => clearTimeout(t);
  }, [step]);
  const paid = step === 10;
  return (
    <section className="relative overflow-hidden rounded-2xl bg-[#0B1529]">
      <div className="pointer-events-none absolute -left-24 -top-32 h-96 w-96 rounded-full bg-[#305EFF]/30 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 right-1/4 h-96 w-96 rounded-full bg-[#7EA0FF]/15 blur-3xl" />
      <div className="relative flex items-center justify-between gap-10 px-12 py-7">
        <div className="max-w-[360px]">
          <div className="text-[28px] font-semibold leading-tight tracking-[-0.02em] text-white">
            COD in.
            <br />
            <span className="text-[#7EA0FF]">Prepaid out.</span>
          </div>
          <div className="mt-3 text-[13.5px] leading-relaxed text-white/60">One message, one tap, paid with Razorpay.</div>
          <div className="mt-5 flex gap-1.5">
            {STEPS.map((_, i) => (
              <span key={i} className={`h-1 rounded-full transition-all duration-300 ${i === step ? 'w-5 bg-white' : i < step ? 'w-1.5 bg-white/60' : 'w-1.5 bg-white/20'}`} />
            ))}
          </div>
        </div>

        <div className="relative flex items-center gap-8">
          {/* the merchant's view of the same order */}
          <div className="w-[210px] rounded-2xl border border-white/10 bg-white/[0.06] p-4 text-white backdrop-blur">
            <div className="text-[10.5px] text-white/50">Order EV-084300</div>
            <div className="mt-0.5 text-[20px] font-semibold tabular-nums">₹1,310</div>
            <div className="mt-3 h-7 overflow-hidden">
              <div className={`transition-transform duration-500 ${paid ? '-translate-y-7' : 'translate-y-0'}`}>
                <div className="flex h-7 items-center">
                  <span className="rounded-full bg-[#FFB547]/15 px-2.5 py-1 text-[11px] font-semibold text-[#FFC978]">Cash on delivery</span>
                </div>
                <div className="flex h-7 items-center">
                  <span className="rounded-full bg-[#2BD98E]/15 px-2.5 py-1 text-[11px] font-semibold text-[#5BE3A8]">✓ Prepaid</span>
                </div>
              </div>
            </div>
          </div>

          <div className="relative rounded-[32px] bg-[#05080F] p-[5px] shadow-[0_30px_60px_rgba(0,0,0,0.55)] ring-1 ring-white/10">
            <div className="relative">
              <Screen step={step} />
              <Pointer at={STEPS[step][1]} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
