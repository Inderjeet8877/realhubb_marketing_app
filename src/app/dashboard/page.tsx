"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Megaphone, MessageSquare } from "lucide-react";
import MetaDashboardContent from "./MetaDashboardContent";
import WhatsAppDashboardContent from "./WhatsAppDashboardContent";
import PageHeader from "@/components/ui/PageHeader";

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
      <PageHeader
        title="Dashboard"
        actions={
          <div className="segmented" role="tablist" aria-label="Dashboard view">
            <button
              role="tab"
              aria-selected={view === "meta"}
              data-active={view === "meta"}
              onClick={() => setView("meta")}
              className="segmented-item"
            >
              <Megaphone className={view === "meta" ? "text-blue-600" : ""} />
              Meta Ads
            </button>
            <button
              role="tab"
              aria-selected={view === "whatsapp"}
              data-active={view === "whatsapp"}
              onClick={() => setView("whatsapp")}
              className="segmented-item"
            >
              <MessageSquare className={view === "whatsapp" ? "text-green-600" : ""} />
              WhatsApp
            </button>
          </div>
        }
      />

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
