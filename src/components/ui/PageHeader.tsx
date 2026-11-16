import type { ReactNode } from "react";

// The one page header every dashboard screen uses: title + optional
// one-line description on the left, actions on the right. On phones the
// actions drop under the title and scroll sideways instead of wrapping
// into a ragged stack.
export default function PageHeader({
  title,
  description,
  actions,
  className = "",
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-5 sm:mb-6 ${className}`}>
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-gray-900 text-balance">{title}</h1>
        {description && <p className="mt-1 text-sm text-gray-500">{description}</p>}
      </div>
      {actions && (
        <div className="flex items-center gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 sm:overflow-visible sm:flex-wrap sm:justify-end shrink-0 pb-0.5">
          {actions}
        </div>
      )}
    </div>
  );
}
