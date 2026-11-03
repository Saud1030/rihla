"use client";

import { useState } from "react";

/**
 * Shown while a page loads: a car drives along a moving road, with the company's logo (uploaded in
 * Admin -> Appearance) in a badge on its door. Without a logo the badge shows the company's initials.
 */
export function CarLoader({ label = "", mark = "" }: { label?: string; mark?: string }) {
  const [logo, setLogo] = useState(true);
  return (
    <div className="car-loader" role="status" aria-live="polite" data-testid="car-loader">
      <div className="road" aria-hidden>
        <span className="speed" style={{ bottom: "34px", width: "26px" }} />
        <span className="speed" style={{ bottom: "24px", width: "40px", animationDelay: "0.25s" }} />
        <span className="speed" style={{ bottom: "44px", width: "18px", animationDelay: "0.45s" }} />
        <div className="car">
          <svg viewBox="0 0 160 64" width="100%" fill="none" aria-hidden>
            {/* body */}
            <path
              d="M8 46c0-6 3-10 9-11l20-4 18-14c4-3 8-4 13-4h34c6 0 10 2 14 5l14 12 15 3c6 1 9 5 9 11v5c0 3-2 5-5 5H13c-3 0-5-2-5-5v-3z"
              fill="currentColor"
            />
            {/* windows */}
            <path d="M58 18c3-2 6-3 10-3h17v17H45l13-14z" fill="#fff" opacity="0.85" />
            <path d="M90 15h13c5 0 8 1 11 4l11 13H90V15z" fill="#fff" opacity="0.85" />
            {/* shine and lights */}
            <path d="M20 37h120" stroke="#fff" strokeOpacity="0.25" strokeWidth="1.5" />
            <rect x="146" y="38" width="7" height="4" rx="2" fill="#fde68a" />
            <rect x="9" y="39" width="5" height="4" rx="2" fill="#fca5a5" />
            {/* wheels */}
            <g className="wheel">
              <circle cx="40" cy="54" r="10" fill="#1c1917" />
              <circle cx="40" cy="54" r="4.5" fill="#d6d3d1" />
              <path d="M40 46v16M32 54h16" stroke="#1c1917" strokeWidth="1.6" />
            </g>
            <g className="wheel">
              <circle cx="122" cy="54" r="10" fill="#1c1917" />
              <circle cx="122" cy="54" r="4.5" fill="#d6d3d1" />
              <path d="M122 46v16M114 54h16" stroke="#1c1917" strokeWidth="1.6" />
            </g>
          </svg>
          <span className="badge" aria-hidden>
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- the uploaded logo, any format
              <img src="/api/brand/logo" alt="" onError={() => setLogo(false)} />
            ) : (
              <span>{mark}</span>
            )}
          </span>
        </div>
      </div>
      {label && <p>{label}</p>}
    </div>
  );
}
