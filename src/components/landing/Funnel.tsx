"use client";

import { useEffect, useRef, useState } from "react";
import { Check, CheckCheck, Megaphone, RotateCcw, UserPlus } from "lucide-react";

// Hero signature: one lead's path from a Meta ad to a WhatsApp reply, with the
// cost per lead settling at the end. Sample data, labelled as such.
const STEP_MS = 900;
const LAST = 5; // 0 ad · 1 lead · 2 sent · 3 delivered · 4 read · 5 replied
const SPEND = 4250;
const LEADS = 34;
const CPL = Math.round(SPEND / LEADS);
const reduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Plays once when scrolled into view (WCAG 2.2.2: no endless loop), then holds; Replay runs it again. `still` never animates. */
export function Funnel({ still = false }: { still?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  const [step, setStep] = useState(LAST);
  const [cpl, setCpl] = useState(CPL);
  const [run, setRun] = useState(0);
  const [motion, setMotion] = useState(false);

  // Start the first run when the panel is on screen.
  useEffect(() => {
    if (still || reduced() || !ref.current) return;
    setMotion(true);
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      setRun(1);
    }, { threshold: 0.4 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [still]);

  useEffect(() => {
    if (!run) return;
    let s = 0;
    setStep(0);
    const id = setInterval(() => {
      s += 1;
      setStep(s);
      if (s >= LAST) clearInterval(id);
    }, STEP_MS);
    return () => clearInterval(id);
  }, [run]);

  // Count the CPL up once the reply lands.
  useEffect(() => {
    if (step < LAST) return setCpl(0);
    if (!run || reduced()) return setCpl(CPL);
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / 700);
      setCpl(Math.round(CPL * (1 - Math.pow(1 - p, 4))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [step, run]);

  const on = (s: number) => (step >= s ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2");
  const Tick = step >= 3 ? CheckCheck : Check;
  const tickLabel = step >= 4 ? "Read" : step >= 3 ? "Delivered" : "Sent";

  return (
    <figure
      ref={ref}
      aria-label="Example: a Meta lead ad becomes a WhatsApp conversation, with the cost per lead"
      className="relative rounded-2xl border border-ink-line bg-ink-2 p-4 sm:p-6"
    >
      <figcaption className="flex items-center justify-between text-xs text-[#A0AECC]">
        <span className="font-medium text-white/90">One lead, start to reply</span>
        <span className="flex items-center gap-3">
          <span className="font-mono">Sample data</span>
          {motion && step >= LAST && (
            <button
              type="button"
              onClick={() => setRun((r) => r + 1)}
              className="-my-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-md px-2 text-white/80 transition-colors duration-fast hover:text-white"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden /> Replay
            </button>
          )}
        </span>
      </figcaption>

      <div className="mt-4 grid grid-cols-[12px_minmax(0,1fr)] gap-x-4">
        {/* Signal rail: lights up to the current step */}
        <div className="relative row-span-4 w-[3px] justify-self-center rounded-full bg-ink-line" aria-hidden>
          <div
            className="absolute inset-x-0 top-0 rounded-full bg-signal transition-[height] duration-slow ease-out"
            style={{ height: `${(step / LAST) * 100}%` }}
          />
        </div>

        <div className="flex items-center gap-3 rounded-xl border border-ink-line bg-ink p-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#1877F2]/15 text-[#7FB2FF]">
            <Megaphone className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-white">Lead ad · 3 BHK, site visits this weekend</p>
            <p className="text-xs text-[#A0AECC]">Facebook &amp; Instagram · Instant Form</p>
          </div>
          <span className="font-mono text-sm text-white">₹{SPEND.toLocaleString("en-IN")}</span>
        </div>

        <div className={`mt-3 flex items-center gap-3 rounded-xl border border-ink-line bg-ink p-3 transition duration-slow ease-out ${on(1)}`}>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-signal-mint/15 text-signal-soft">
            <UserPlus className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white">New lead: Priya S.</p>
            <p className="font-mono text-xs text-[#A0AECC]">+91 98••• ••210 · added to contacts</p>
          </div>
        </div>

        <div className={`mt-3 transition duration-slow ease-out ${on(2)}`}>
          <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-[#134D3F] px-3.5 py-2.5 text-sm text-white">
            Hi Priya, thanks for asking about the 3 BHK. Shall we book your site visit for Saturday?
            <span className="mt-1 flex items-center justify-end gap-1 text-[11px] text-white/70">
              <span className="font-mono">10:42</span>
              <Tick
                className={`h-3.5 w-3.5 transition-colors duration-base ${step >= 4 ? "text-signal-cyan" : "text-white/70"}`}
                aria-label={tickLabel}
              />
            </span>
          </div>
        </div>

        <div className={`mt-2 transition duration-slow ease-out ${on(5)}`}>
          <div className="max-w-[70%] rounded-2xl rounded-tl-sm bg-ink-3 px-3.5 py-2.5 text-sm text-white">
            Yes, Saturday 11 am works.
          </div>
        </div>
      </div>

      <dl className="mt-5 grid grid-cols-3 divide-x divide-ink-line rounded-xl border border-ink-line text-center">
        {[
          ["Spend", `₹${SPEND.toLocaleString("en-IN")}`],
          ["Leads", String(LEADS)],
          ["Cost per lead", step >= LAST ? `₹${cpl}` : "—"],
        ].map(([k, val]) => (
          <div key={k} className="px-2 py-3">
            <dt className="text-[11px] text-[#A0AECC]">{k}</dt>
            <dd className={`font-mono text-lg ${k === "Cost per lead" && step >= LAST ? "text-signal-cyan" : "text-white"}`}>{val}</dd>
          </div>
        ))}
      </dl>
    </figure>
  );
}
