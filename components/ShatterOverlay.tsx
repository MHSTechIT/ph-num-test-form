"use client";

import { useEffect, useState } from "react";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";

// Default glass-shatter Lottie. Swap this URL for any .lottie / .json
// asset from lottiefiles.com or your own host. The CSS shatter below runs
// regardless, so even if this fails to load you still see an animation.
export const SHATTER_LOTTIE_URL =
  "https://lottie.host/9ea25f93-8aae-4e24-95b1-31bca2bbcadf/iZxA1xkQXa.lottie";

const SHARDS = (() => {
  const out: { tx: number; ty: number; rotate: number; delayMs: number; size: number; hue: number }[] = [];
  const count = 18;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + (i % 2 ? 0.15 : -0.05);
    const distance = 320 + (i % 4) * 90; // px
    out.push({
      tx: Math.cos(angle) * distance,
      ty: Math.sin(angle) * distance,
      rotate: (i % 2 === 0 ? 1 : -1) * (180 + i * 22),
      delayMs: (i % 5) * 25,
      size: 56 + (i % 4) * 18,
      hue: 270 + (i % 6) * 8,
    });
  }
  return out;
})();

/**
 * Shatter that visually destroys the parent container. Place this as a
 * sibling to the card you want to "break" inside a `relative` parent.
 * The shards originate from the centre of this overlay's bounding box.
 */
export function CardShatter() {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setArmed(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 z-30 overflow-visible">
      {/* Crack overlay — appears immediately, fades */}
      <CrackOverlay armed={armed} />

      {/* Lottie centerpiece (sized to roughly fill the card area) */}
      <div className={`absolute inset-0 flex items-center justify-center ${armed ? "shatter-lottie-fade" : ""}`}>
        <DotLottieReact
          src={SHATTER_LOTTIE_URL}
          autoplay
          loop={false}
          style={{ width: "100%", height: "100%" }}
        />
      </div>

      {/* Flash */}
      <div className={`shatter-flash ${armed ? "is-armed" : ""}`} />

      {/* Shards radiating outward from the card centre */}
      <div className="absolute inset-0">
        {SHARDS.map((s, i) => (
          <span
            key={i}
            className={`shatter-shard ${armed ? "is-armed" : ""}`}
            style={
              {
                "--tx": `${s.tx}px`,
                "--ty": `${s.ty}px`,
                "--rotate": `${s.rotate}deg`,
                "--size": `${s.size}px`,
                animationDelay: `${s.delayMs}ms`,
                background: `linear-gradient(135deg, hsl(${s.hue} 90% 80% / 0.95), hsl(${s.hue} 80% 95% / 0.6))`,
              } as React.CSSProperties
            }
          />
        ))}
      </div>
    </div>
  );
}

function CrackOverlay({ armed }: { armed: boolean }) {
  return (
    <svg
      className={`absolute inset-0 size-full ${armed ? "shatter-crack-anim" : ""}`}
      viewBox="0 0 400 200"
      preserveAspectRatio="none"
      fill="none"
    >
      <g stroke="rgba(120, 80, 200, 0.55)" strokeLinecap="round" strokeLinejoin="round">
        <path d="M200 100 L80 30" strokeWidth="1.6" />
        <path d="M200 100 L320 25" strokeWidth="1.6" />
        <path d="M200 100 L40 110" strokeWidth="1.4" />
        <path d="M200 100 L370 130" strokeWidth="1.4" />
        <path d="M200 100 L120 180" strokeWidth="1.6" />
        <path d="M200 100 L290 180" strokeWidth="1.6" />
        <path d="M200 100 L210 5" strokeWidth="1.2" />
        <path d="M200 100 L195 195" strokeWidth="1.2" />
        {/* secondary crack lines */}
        <path d="M150 60 L120 20" strokeWidth="1" opacity="0.7" />
        <path d="M260 70 L290 30" strokeWidth="1" opacity="0.7" />
        <path d="M130 130 L80 160" strokeWidth="1" opacity="0.7" />
        <path d="M270 130 L330 160" strokeWidth="1" opacity="0.7" />
      </g>
    </svg>
  );
}
