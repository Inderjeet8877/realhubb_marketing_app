// Shown instantly (inside the sidebar shell) while a dashboard page's code
// and data load, so a tap on the menu always gives immediate feedback.
export default function DashboardLoading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="mb-6 space-y-2">
        <div className="h-7 w-48 rounded-lg bg-gray-200" />
        <div className="h-4 w-72 max-w-full rounded bg-gray-200/70" />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="card p-4 sm:p-5 space-y-3">
            <div className="h-3.5 w-20 rounded bg-gray-200" />
            <div className="h-6 w-24 rounded bg-gray-200" />
          </div>
        ))}
      </div>
      <div className="card overflow-hidden">
        <div className="h-12 border-b border-gray-100 bg-gray-50/60" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex gap-4 px-4 py-4 border-t border-gray-100 first:border-t-0">
            <div className="h-4 flex-1 rounded bg-gray-200/80" />
            <div className="h-4 w-24 rounded bg-gray-200/60" />
            <div className="h-4 w-16 rounded bg-gray-200/60" />
          </div>
        ))}
      </div>
    </div>
  );
}
