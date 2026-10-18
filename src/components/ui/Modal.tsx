"use client";

import { useEffect, useId, useRef } from "react";

/** Native <dialog>: focus trap, Esc to close and backdrop come from the browser. */
export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={id}
      onClose={onClose}
      className="w-[calc(100%-2rem)] max-w-md rounded-2xl p-0 shadow-2xl backdrop:bg-[#0F1A38]/50"
    >
      {open && (
        <div className="p-6">
          <h2 id={id} className="text-lg font-bold text-[#0F1A38]">
            {title}
          </h2>
          <div className="mt-3">{children}</div>
        </div>
      )}
    </dialog>
  );
}

export const btn = {
  primary:
    "min-h-[44px] px-4 rounded-lg bg-[#0F1A38] text-white text-sm font-semibold hover:bg-[#1b2a55] disabled:opacity-60 inline-flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-teal-600",
  secondary:
    "min-h-[44px] px-4 rounded-lg border border-gray-300 bg-white text-gray-800 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 inline-flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-teal-600",
  danger:
    "min-h-[44px] px-4 rounded-lg bg-red-700 text-white text-sm font-semibold hover:bg-red-800 disabled:opacity-60 inline-flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-red-600",
  success:
    "min-h-[44px] px-4 rounded-lg bg-teal-700 text-white text-sm font-semibold hover:bg-teal-800 disabled:opacity-60 inline-flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-teal-600",
};
