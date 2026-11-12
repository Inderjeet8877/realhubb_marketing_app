// Generic UI formatting helpers — not WhatsApp/Meta-specific, unlike
// @/lib/whatsapp-send, so it lives separately even though both are
// client+server safe.

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

/** 1234 → "1.2K". */
export const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : n.toString());

/** ₹ with Indian grouping (1,24,580). Zero or less shows "—" unless `zero` is set. */
export function inr(n: number, digits = 0, zero = false): string {
  if (!zero && !(n > 0)) return "—";
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}
