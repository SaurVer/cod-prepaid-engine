// Elvora is a fictional brand; this mark is original artwork made for the prototype.
export function BrandMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <defs>
        <linearGradient id="ev-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2C5A4C" />
          <stop offset="1" stopColor="#14302A" />
        </linearGradient>
        <linearGradient id="ev-leaf" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F3DFAE" />
          <stop offset="1" stopColor="#C9A86A" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="url(#ev-bg)" />
      <path d="M11 29C11 18 18 11 30 10c0 12-7 19-19 19z" fill="url(#ev-leaf)" />
      <path d="M12.5 27.5C17 22.5 21 18.5 26.5 14" stroke="#1F3B33" strokeWidth="1.5" strokeLinecap="round" fill="none" />
      <circle cx="29.5" cy="27.5" r="2.2" fill="#F3DFAE" />
    </svg>
  );
}

export function BrandLogo({ light = false }: { light?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <BrandMark />
      <div className="leading-tight">
        <div className={`text-[15px] font-semibold tracking-[0.02em] ${light ? 'text-white' : 'text-ink'}`}>Elvora</div>
        <div className={`text-[10.5px] ${light ? 'text-white/55' : 'text-ink-faint'}`}>Skin · Hair · Wellness</div>
      </div>
    </div>
  );
}

/** PayShift: the product (this tool). Original mark: two arrows turning cash into card. */
export function PayShiftMark({ size = 22, light = false }: { size?: number; light?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect width="24" height="24" rx="6" fill={light ? '#FFFFFF' : '#305EFF'} />
      <path d="M6 9.5h9.5l-2.5-2.5M18 14.5H8.5l2.5 2.5" stroke={light ? '#305EFF' : '#FFFFFF'} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
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
