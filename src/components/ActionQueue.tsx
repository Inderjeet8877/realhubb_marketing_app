import Link from "next/link";
import { ListChecks, ChevronRight } from "lucide-react";
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

const TONE_CLASSES: Record<ActionItem["tone"], { icon: string; iconBg: string; button: string }> = {
  red:   { icon: "text-red-600",   iconBg: "bg-red-50",   button: "text-red-700 bg-red-50 hover:bg-red-100" },
  amber: { icon: "text-amber-600", iconBg: "bg-amber-50", button: "text-amber-700 bg-amber-50 hover:bg-amber-100" },
  blue:  { icon: "text-blue-600",  iconBg: "bg-blue-50",  button: "text-blue-700 bg-blue-50 hover:bg-blue-100" },
};

// A short, prioritized "what needs my attention right now" list — real alerts
// derived from actual data (high CPL, quality drops, unreviewed enquiries),
// not decorative placeholders. Used on both the Meta and WhatsApp dashboards.
export function ActionQueue({ items, title = "Action Queue" }: { items: ActionItem[]; title?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-900 flex items-center gap-2">
          <ListChecks className="w-4 h-4 text-gray-400" />
          {title}
        </h2>
        {items.length > 0 && (
          <span className="text-xs font-medium text-gray-400">{items.length} before review</span>
        )}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">Nothing needs attention right now.</p>
      ) : (
        <div className="divide-y divide-gray-50">
          {items.map((item) => {
            const tone = TONE_CLASSES[item.tone];
            const Icon = item.icon;
            return (
              <div key={item.id} className="flex items-center gap-3 px-5 py-3">
                <div className={`p-2 rounded-lg shrink-0 ${tone.iconBg}`}>
                  <Icon className={`w-4 h-4 ${tone.icon}`} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
                  {item.subtitle && <p className="text-xs text-gray-500 truncate">{item.subtitle}</p>}
                </div>
                <Link
                  href={item.href}
                  className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${tone.button}`}
                >
                  {item.actionLabel} <ChevronRight className="w-3 h-3" />
                </Link>
              </div>
            );
          })}
        </div>
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
