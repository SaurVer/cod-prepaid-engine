'use client';

// Overview banner: a looping animation of one COD order turning prepaid (pure CSS + state, no video file).

import { useEffect, useState } from 'react';

const STEPS = [
  { t: 'Order placed on cash on delivery', s: 'A repeat customer orders ₹1,310 of skincare and picks COD.' },
  { t: 'AI sends a reminder on WhatsApp', s: 'PayShift predicts a plain reminder will work, so no discount is given.' },
  { t: 'Customer taps the pay link', s: 'One tap opens a secure Razorpay checkout for that order.' },
  { t: 'Pays by UPI in seconds', s: 'Same order, now prepaid: no cash handling, far fewer returns.' },
];

function Phone({ step }: { step: number }) {
  const screen = (i: number) => `absolute inset-0 flex flex-col transition-all duration-500 ${step === i ? 'opacity-100 translate-y-0' : 'pointer-events-none opacity-0 translate-y-3'}`;
  return (
    <div className="relative h-[300px] w-[160px] shrink-0 rounded-[28px] border-[5px] border-[#0B1529] bg-[#0B1529] shadow-pop">
      <div className="absolute left-1/2 top-1.5 z-10 h-3 w-14 -translate-x-1/2 rounded-full bg-[#0B1529]" />
      <div className="relative h-full overflow-hidden rounded-[22px] bg-[#ECE5DD] text-[9.5px] leading-snug text-ink">
        {/* 0: order placed */}
        <div className={`${screen(0)} items-center justify-center bg-white px-3 text-center`}>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#1F3B33] text-[15px] text-[#F3DFAE]">✦</div>
          <div className="mt-2 text-[11px] font-semibold">Order confirmed</div>
          <div className="mt-0.5 text-ink-soft">Elvora · EV-084300</div>
          <div className="mt-3 w-full rounded-lg bg-panel px-2 py-1.5 text-left">
            <div className="flex justify-between"><span>Vitamin C serum</span><span>₹1,310</span></div>
            <div className="mt-1 flex justify-between font-semibold"><span>Payment</span><span className="text-warn">Cash on delivery</span></div>
          </div>
        </div>
        {/* 1 + 2: WhatsApp chat */}
        <div className={screen(step === 2 ? 2 : 1)}>
          <div className="flex items-center gap-1.5 bg-[#075E54] px-2.5 pb-2 pt-5 text-white">
            <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#1F3B33] text-[9px] text-[#F3DFAE]">✦</div>
            <span className="font-semibold">Elvora</span>
          </div>
          <div className="flex-1 px-2 py-3">
            <div className="max-w-[92%] rounded-lg rounded-tl-none bg-white px-2 py-1.5 shadow-sm">
              Hi Priya, your Elvora order is packed. Pay ₹1,310 online now and skip the cash at your door.
              <div
                className={`mt-1.5 rounded-md px-2 py-1 text-center font-semibold transition-colors duration-300 ${
                  step === 2 ? 'bg-[#305EFF] text-white' : 'bg-rzp-soft text-rzp'
                }`}
              >
                Pay online →
              </div>
              <div className="mt-0.5 text-right text-[8px] text-ink-faint">9:00 PM</div>
            </div>
            {step === 2 && <span className="absolute left-[46%] top-[122px] h-6 w-6 animate-ping rounded-full bg-[#305EFF]/40" />}
          </div>
        </div>
        {/* 3: checkout + paid */}
        <div className={`${screen(3)} bg-white`}>
          <div className="bg-[#0F1E3A] px-2.5 pb-2 pt-5 text-white">
            <div className="text-[8px] opacity-70">Elvora · secured by Razorpay</div>
            <div className="text-[13px] font-semibold">₹1,310</div>
          </div>
          <div className="flex-1 space-y-1.5 px-2.5 py-3">
            {['UPI · GPay', 'UPI · PhonePe', 'Cards'].map((m, i) => (
              <div key={m} className={`rounded-md border px-2 py-1.5 ${i === 0 ? 'border-rzp bg-rzp-faint font-semibold' : 'border-line'}`}>
                {m}
              </div>
            ))}
          </div>
          <div className="mx-2.5 mb-3 flex items-center justify-center gap-1 rounded-md bg-ok py-2 font-semibold text-white">
            <span className="flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white text-[8px] text-ok">✓</span> Paid · order is now prepaid
          </div>
        </div>
      </div>
    </div>
  );
}

export function HeroDemo() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => (s + 1) % STEPS.length), 2600);
    return () => clearInterval(t);
  }, []);
  return (
    <section className="relative flex items-center gap-10 overflow-hidden rounded-2xl bg-rzp-navy px-8 py-6 text-white">
      <div className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-rzp/40 blur-3xl" />
      <div className="relative min-w-0 flex-1">
        <div className="text-[12px] font-medium text-white/60">How PayShift turns a COD order into prepaid</div>
        <ol className="mt-4 space-y-2.5">
          {STEPS.map((s, i) => (
            <li key={s.t} className={`flex gap-3 transition-opacity duration-500 ${step === i ? 'opacity-100' : 'opacity-40'}`}>
              <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${step === i ? 'bg-rzp text-white' : 'bg-white/15'}`}>
                {i + 1}
              </span>
              <div>
                <div className="text-[14px] font-semibold">{s.t}</div>
                <div className="text-[12.5px] text-white/65">{s.s}</div>
              </div>
            </li>
          ))}
        </ol>
      </div>
      <div className="relative">
        <Phone step={step} />
      </div>
    </section>
  );
}
