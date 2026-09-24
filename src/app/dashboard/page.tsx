"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import MetaDashboardContent from "./MetaDashboardContent";
import WhatsAppDashboardContent from "./WhatsAppDashboardContent";
import MetaWhatsAppToggle from "@/components/MetaWhatsAppToggle";

// Single dashboard route — Meta and WhatsApp each keep their own component
// (MetaDashboardContent / WhatsAppDashboardContent, moved here unchanged
// from their old separate pages) so the toggle just mounts one or the
// other. Only the active one is mounted, so its data fetches fire only
// while it's actually being viewed — switching away and back re-fetches
// fresh rather than keeping stale data around, same as visiting either as
// a separate page did before.
function DashboardContent() {
  const searchParams = useSearchParams();
  // ?view=whatsapp lets the old /dashboard/whatsapp/insights redirect (and
  // any other future deep link) land on the right side of the toggle
  // instead of always defaulting to Meta.
  const [view, setView] = useState<"meta" | "whatsapp">(
    searchParams.get("view") === "whatsapp" ? "whatsapp" : "meta"
  );

  return (
    <div>
      <div className="flex items-center justify-end gap-1.5 sm:gap-3 mb-4 flex-nowrap">
        <span className={`text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors ${view === "meta" ? "text-blue-600" : "text-gray-400"}`}>
          Meta
        </span>
        <span className="flex-shrink-0">
          <MetaWhatsAppToggle checked={view === "whatsapp"} onChange={(isWhatsApp) => setView(isWhatsApp ? "whatsapp" : "meta")} />
        </span>
        <span className={`text-xs sm:text-sm font-semibold whitespace-nowrap transition-colors ${view === "whatsapp" ? "text-green-600" : "text-gray-400"}`}>
          WhatsApp
        </span>
      </div>

      {view === "meta" ? <MetaDashboardContent /> : <WhatsAppDashboardContent />}
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={null}>
      <DashboardContent />
    </Suspense>
  );
}
