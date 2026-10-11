// Dewlune is a fictional brand; this mark is original artwork made for the prototype.
export function DewluneMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <linearGradient id="dl-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2A3F66" />
          <stop offset="1" stopColor="#14223B" />
        </linearGradient>
        <linearGradient id="dl-moon" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFD3C2" />
          <stop offset="1" stopColor="#F4A38C" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="url(#dl-bg)" />
      <path d="M23.5 9.5a11 11 0 1 0 8.6 17.4A9 9 0 0 1 23.5 9.5z" fill="url(#dl-moon)" />
      <path d="M27.5 12.2c1.6 2.3 2.4 3.9 2.4 5.1a2.4 2.4 0 0 1-4.8 0c0-1.2.8-2.8 2.4-5.1z" fill="#BFE6FF" />
    </svg>
  );
}

export function DewluneLogo({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <DewluneMark />
      <div className="leading-tight">
        <div className={`text-[15px] font-semibold tracking-[-0.01em] ${light ? 'text-white' : 'text-ink'}`}>Dewlune</div>
        <div className={`text-[10.5px] ${light ? 'text-white/55' : 'text-ink-faint'}`}>Skin · Hair · Wellness</div>
      </div>
    </div>
  );
}

/** "Powered by Razorpay": the official logo if added to /public, otherwise a text wordmark. */
export function PoweredByRazorpay({ light = false }: { light?: boolean }) {
  const logo = process.env.NEXT_PUBLIC_RZP_LOGO;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] ${light ? 'text-white/60' : 'text-ink-faint'}`}>
      Powered by
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logo} alt="Razorpay" className="h-[14px] w-auto" />
      ) : (
        <span className={`text-[13px] font-bold italic tracking-[-0.02em] ${light ? 'text-white' : 'text-rzp'}`}>Razorpay</span>
      )}
    </span>
  );
}

export function ConceptLabel({ className = '' }: { className?: string }) {
  return (
    <span className={`pill border border-warn/20 bg-warn-soft text-warn ${className}`}>Concept prototype · synthetic data</span>
  );
}
