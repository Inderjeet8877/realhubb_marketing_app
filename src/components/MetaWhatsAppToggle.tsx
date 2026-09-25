"use client";

interface MetaWhatsAppToggleProps {
  // false = Meta (left/unchecked), true = WhatsApp (right/checked)
  checked: boolean;
  onChange: (checked: boolean) => void;
}

// Plain Tailwind switch — same reliable button+span pattern already used for
// the "Auto Refresh" toggle on the Leads page. The previous version used
// `-webkit-linear-gradient(...)`, a non-standard syntax deprecated over a
// decade ago with no fallback; modern mobile browsers don't render it
// consistently, which is what made the toggle look broken specifically on
// mobile. This has no such dependency.
export default function MetaWhatsAppToggle({ checked, onChange }: MetaWhatsAppToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      aria-label={checked ? "Showing WhatsApp dashboard — switch to Meta" : "Showing Meta dashboard — switch to WhatsApp"}
      className={`relative inline-flex h-[20px] w-[38px] shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-400 ${
        checked ? "bg-green-500" : "bg-blue-500"
      }`}
    >
      <span
        className={`inline-block h-[16px] w-[16px] transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? "translate-x-[19px]" : "translate-x-[2px]"
        }`}
      />
    </button>
  );
}
