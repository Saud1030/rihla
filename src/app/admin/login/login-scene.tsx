/**
 * The sign-in backdrop: a desert road at dusk. A luxury car drives past behind the card,
 * switches its headlights on as it comes in, and flashes them when the sign-in succeeds
 * (the form puts data-welcome on the page). Pure SVG and CSS; still when motion is reduced.
 */
export function LoginScene() {
  return (
    <div className="login-scene" aria-hidden="true">
      <div className="login-sky" />
      <div className="login-stars" />
      <div className="login-moon" />
      {/* dunes and palms, far to near */}
      <svg className="login-dunes" viewBox="0 0 1440 420" preserveAspectRatio="xMidYMax slice">
        <path d="M0 250 Q180 170 380 220 T760 200 T1120 230 T1440 190 V420 H0Z" fill="#3a2a1f" />
        <path d="M0 300 Q240 230 520 280 T1000 260 T1440 290 V420 H0Z" fill="#2b1f17" />
        <g fill="#1d1510">
          <path d="M1180 300 q4 -70 10 -112 q-30 6 -52 26 q20 -30 50 -34 q-26 -14 -56 -6 q30 -16 58 -2 q-8 -22 -30 -36 q30 10 40 32 q10 -26 40 -32 q-26 16 -32 36 q30 -10 56 6 q-32 -6 -52 8 q30 6 48 30 q-24 -18 -50 -22 q-4 40 -2 106z" />
          <path d="M240 290 q3 -52 7 -84 q-22 4 -38 20 q14 -22 36 -26 q-20 -10 -42 -4 q22 -12 44 -2 q-6 -16 -22 -26 q22 8 30 24 q8 -20 30 -24 q-20 12 -24 26 q22 -8 42 4 q-24 -4 -40 6 q22 4 36 22 q-18 -14 -38 -16 q-2 30 -1 80z" />
        </g>
      </svg>
      <div className="login-road">
        <span className="login-road-line" />
      </div>
      {/* the car: drives along the road, behind the card */}
      <div className="login-car-track">
        <svg className="login-car" viewBox="0 0 640 130" width="640" height="130">
          <defs>
            <linearGradient id="lc-body" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#3b3632" />
              <stop offset="0.45" stopColor="#16130f" />
              <stop offset="1" stopColor="#050403" />
            </linearGradient>
            <linearGradient id="lc-glass" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#4b5563" />
              <stop offset="1" stopColor="#111827" />
            </linearGradient>
            <linearGradient id="lc-beam" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#fff7d6" stopOpacity="0.95" />
              <stop offset="0.35" stopColor="#ffe9a8" stopOpacity="0.45" />
              <stop offset="1" stopColor="#ffe9a8" stopOpacity="0" />
            </linearGradient>
            <radialGradient id="lc-glow">
              <stop offset="0" stopColor="#fffbe8" />
              <stop offset="0.4" stopColor="#ffe9a8" stopOpacity="0.8" />
              <stop offset="1" stopColor="#ffe9a8" stopOpacity="0" />
            </radialGradient>
          </defs>
          {/* headlight beam on the road ahead */}
          <g className="lc-beam">
            <path d="M362 66 L640 30 L640 112 Z" fill="url(#lc-beam)" />
            <ellipse cx="520" cy="112" rx="120" ry="10" fill="#ffe9a8" opacity="0.25" />
          </g>
          {/* shadow */}
          <ellipse cx="190" cy="112" rx="182" ry="9" fill="#000" opacity="0.55" />
          {/* body: a long, low saloon (front to the right) */}
          <path
            d="M12 80 Q12 63 38 59 L112 53 Q146 27 184 22 L236 22 Q266 25 300 50 L338 55 Q360 58 364 72 L364 86 Q364 92 356 92 L322 92 A26 26 0 0 0 270 92 L114 92 A26 26 0 0 0 62 92 L22 92 Q12 92 12 84Z"
            fill="url(#lc-body)"
            stroke="#c9a24a"
            strokeOpacity="0.35"
            strokeWidth="1.2"
          />
          {/* windows */}
          <path d="M122 53 Q152 31 186 27 L208 27 L208 53Z" fill="url(#lc-glass)" />
          <path d="M214 27 L234 27 Q258 30 288 51 L214 53Z" fill="url(#lc-glass)" />
          {/* chrome belt line and door cut */}
          <path d="M40 66 Q190 60 344 63" stroke="#d6d3d1" strokeOpacity="0.55" strokeWidth="1.6" fill="none" />
          <path d="M210 54 L210 88" stroke="#000" strokeOpacity="0.5" strokeWidth="1.2" />
          {/* tail light and headlight */}
          <rect x="13" y="64" width="12" height="6" rx="2" fill="#b91c1c" className="lc-tail" />
          <path d="M346 61 L362 63 L362 69 L344 68Z" fill="#fef3c7" className="lc-lamp" />
          <circle cx="356" cy="65" r="18" fill="url(#lc-glow)" className="lc-glow" />
          {/* wheels */}
          {[88, 296].map((cx) => (
            <g key={cx} transform={`translate(${cx} 92)`}>
              <circle r="21" fill="#0a0908" />
              <g className="lc-wheel">
                <circle r="13" fill="#57534e" />
                <circle r="13" fill="none" stroke="#d6d3d1" strokeWidth="1.5" />
                {[0, 72, 144, 216, 288].map((a) => (
                  <rect key={a} x="-1.3" y="-12" width="2.6" height="12" rx="1" fill="#e7e5e4" transform={`rotate(${a})`} />
                ))}
                <circle r="3" fill="#c9a24a" />
              </g>
            </g>
          ))}
        </svg>
      </div>
      {/* drifting golden sand */}
      <div className="login-sand">
        {Array.from({ length: 18 }, (_, i) => (
          <span key={i} style={{ "--i": i } as React.CSSProperties} />
        ))}
      </div>
    </div>
  );
}
