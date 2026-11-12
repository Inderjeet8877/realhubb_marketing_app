import { inr } from "@/lib/format";

/** Cost per lead, coloured by band (<₹300 good, <₹600 moderate, else high) with the value always shown. */
export function CplBadge({ cpl, digits = 0 }: { cpl: number; digits?: number }) {
  if (!cpl) return <span className="text-gray-400 text-sm">—</span>;
  const cls = cpl < 300 ? "text-green-700" : cpl < 600 ? "text-yellow-700" : "text-red-700";
  return <span className={`text-sm font-semibold tabular-nums ${cls}`}>{inr(cpl, digits)}</span>;
}
