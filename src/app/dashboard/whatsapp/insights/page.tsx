import { redirect } from "next/navigation";

// This page's content merged into the unified /dashboard (toggle between
// Meta/WhatsApp) — kept as a redirect so any existing bookmark or link to
// the old URL still lands somewhere real instead of 404ing.
export default function InsightsRedirect() {
  redirect("/dashboard?view=whatsapp");
}
