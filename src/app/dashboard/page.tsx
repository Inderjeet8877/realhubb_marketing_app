"use client";

import { Suspense, useState } from "react";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Megaphone, MessageSquare } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import { StatCardsSkeleton } from "@/components/Skeletons";

// Each view (and the recharts library both use) is its own chunk: the page
// shell paints immediately, and the WhatsApp view's code only downloads
// when someone switches to it.
const MetaDashboardContent = dynamic(() => import("./MetaDashboardContent"), {
  ssr: false,
  loading: () => <StatCardsSkeleton count={6} />,
});
const WhatsAppDashboardContent = dynamic(() => import("./WhatsAppDashboardContent"), {
  ssr: false,
  loading: () => <StatCardsSkeleton count={3} />,
});

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
    <Suspense fallback={<StatCardsSkeleton count={6} />}>
      <DashboardContent />
    </Suspense>
  );
}
