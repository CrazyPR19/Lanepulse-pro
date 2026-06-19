// LanePulse Pro logo component

export function Logo({
  size = 40,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 120 120"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="lpGrad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0b1f3a" />
          <stop offset="55%" stopColor="#0e3a6b" />
          <stop offset="100%" stopColor="#1f9fbf" />
        </linearGradient>
        <linearGradient id="lpAqua" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#1f9fbf" />
          <stop offset="100%" stopColor="#7fdce6" />
        </linearGradient>
      </defs>
      <rect x="6" y="6" width="108" height="108" rx="26" fill="url(#lpGrad)" />
      <circle
        cx="60"
        cy="58"
        r="30"
        fill="none"
        stroke="#ffffff"
        strokeWidth="5"
        opacity="0.95"
      />
      <circle
        cx="60"
        cy="58"
        r="30"
        fill="none"
        stroke="url(#lpAqua)"
        strokeWidth="5"
        strokeDasharray="94 200"
        strokeLinecap="round"
        transform="rotate(-90 60 58)"
      />
      <rect x="55" y="20" width="10" height="8" rx="2" fill="#ffffff" />
      <line
        x1="60"
        y1="58"
        x2="60"
        y2="40"
        stroke="#ffffff"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <line
        x1="60"
        y1="58"
        x2="74"
        y2="64"
        stroke="#7fdce6"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="60" cy="58" r="3.5" fill="#ffffff" />
      <path
        d="M22 92 q9 -8 18 0 t18 0 t18 0 t18 0"
        stroke="#7fdce6"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        opacity="0.9"
      />
      <path
        d="M26 102 q9 -7 17 0 t17 0 t17 0 t17 0"
        stroke="#ffffff"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
        opacity="0.65"
      />
    </svg>
  );
}

export function LogoLockup({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <Logo size={compact ? 32 : 40} className="lp-wave-anim" />
      <div className="flex flex-col leading-tight">
        <span
          className={`font-extrabold tracking-tight text-foreground ${
            compact ? "text-base" : "text-lg"
          }`}
        >
          LanePulse <span className="text-aqua">Pro</span>
        </span>
        {!compact && (
          <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Smart Swim Timing
          </span>
        )}
      </div>
    </div>
  );
}
