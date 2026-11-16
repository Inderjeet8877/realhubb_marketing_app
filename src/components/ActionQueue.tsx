import Link from "next/link";
import { CheckCircle2, ChevronRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface ActionItem {
  id: string;
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  actionLabel: string;
  href: string;
  tone: "red" | "amber" | "blue";
}

const TONE_CLASSES: Record<ActionItem["tone"], { icon: string; iconBg: string }> = {
  red:   { icon: "text-red-600",   iconBg: "bg-red-50"   },
  amber: { icon: "text-amber-600", iconBg: "bg-amber-50" },
  blue:  { icon: "text-blue-600",  iconBg: "bg-blue-50"  },
};

// A short, prioritized "what needs my attention right now" list — real alerts
// derived from actual data (high CPL, quality drops, unreviewed enquiries),
// not decorative placeholders. Used on both the Meta and WhatsApp dashboards.
export function ActionQueue({ items, title = "Action Queue" }: { items: ActionItem[]; title?: string }) {
  return (
    <div className="card overflow-hidden flex flex-col">
      <div className="card-header">
        <h2 className="card-title">{title}</h2>
        {items.length > 0 && <span className="badge badge-gray tabular-nums">{items.length} to review</span>}
      </div>
      {items.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-2 px-5 py-8 text-center">
          <CheckCircle2 className="w-6 h-6 text-green-500" />
          <p className="text-sm text-gray-500">Nothing needs attention right now.</p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100">
          {items.map((item) => {
            const tone = TONE_CLASSES[item.tone];
            const Icon = item.icon;
            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className="group flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-gray-50 transition-colors"
                >
                  <span className={`grid place-items-center w-8 h-8 rounded-lg shrink-0 ${tone.iconBg}`}>
                    <Icon className={`w-4 h-4 ${tone.icon}`} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-gray-900 truncate">{item.title}</span>
                    {item.subtitle && <span className="block text-xs text-gray-500 truncate">{item.subtitle}</span>}
                  </span>
                  <span className="shrink-0 inline-flex items-center gap-0.5 text-xs font-medium text-blue-600 group-hover:text-blue-700">
                    {item.actionLabel} <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Slim inline progress bar — used for "this account's share of total spend",
// per-template read rate, etc. Not a chart library component: cheap enough
// to inline directly wherever a single percentage needs a visual bar.
export function ProgressBar({ percent, colorClass = "bg-blue-500" }: { percent: number; colorClass?: string }) {
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div className={`h-full rounded-full ${colorClass}`} style={{ width: `${clamped}%` }} />
    </div>
  );
}
