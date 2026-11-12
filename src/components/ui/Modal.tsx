"use client";

import { useEffect, useId, useRef } from "react";

/**
 * Native <dialog>: focus trap, Esc and the backdrop come from the browser.
 * With `title` it renders the standard card; without it, the caller supplies the
 * panel and must pass `label` for screen readers. Esc and backdrop clicks call
 * onClose, so a caller that ignores them (e.g. while uploading) keeps it open.
 */
export function Modal({ open, onClose, title, label, className = "p-4", children }: {
  open: boolean;
  onClose: () => void;
  title?: string;
  label?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const common = {
    ref,
    onCancel: (e: React.SyntheticEvent) => (e.preventDefault(), onClose()),
    onClick: (e: React.MouseEvent) => e.target === e.currentTarget && onClose(),
  };
  if (!title) {
    return (
      <dialog {...common} aria-label={label} className={`m-0 h-full max-h-none w-full max-w-none bg-transparent open:flex items-center justify-center backdrop:bg-[#0F1A38]/50 ${className}`}>
        {open && children}
      </dialog>
    );
  }
  return (
    <dialog
      {...common}
      aria-labelledby={id}
      className="w-[calc(100%-2rem)] max-w-md rounded-2xl border border-line bg-surface p-0 text-fg shadow-[0_24px_60px_-12px_rgba(15,26,56,0.35)] backdrop:bg-[#0F1A38]/50"
    >
      {open && (
        <div className="p-6">
          <h2 id={id} className="font-display text-lg font-semibold text-fg">
            {title}
          </h2>
          <div className="mt-3">{children}</div>
        </div>
      )}
    </dialog>
  );
}

const BTN = "min-h-[44px] px-4 rounded-lg text-sm font-semibold inline-flex items-center justify-center gap-2 transition-[filter,background-color,transform] duration-fast ease-out active:scale-[0.99] disabled:opacity-60 disabled:active:scale-100";

export const btn = {
  primary: `${BTN} bg-primary text-on-primary hover:brightness-125`,
  secondary: `${BTN} border border-line bg-surface text-fg font-medium hover:bg-bg`,
  danger: `${BTN} bg-danger text-surface hover:brightness-110`,
  success: `${BTN} bg-accent text-on-accent hover:brightness-110`,
};
