"use client";

import { Suspense, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import useSWR from "swr";
import {
  User, Bell, XCircle, Loader2, Facebook, RefreshCw, Unlink,
  AlertTriangle, CheckCircle2, Clock,
} from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { useNotifications } from "@/contexts/NotificationContext";
import { FormSkeleton } from "@/components/Skeletons";
import { fetcher, swrConfig } from "@/lib/swr";

type Slot = "1" | "2" | "3";
const SLOTS: Slot[] = ["1", "2", "3"];

interface SlotStatus {
  slot: Slot; connected: boolean; label: string | null;
  expiresAt: string | null; daysUntilExpiry: number | null;
}
interface DiscoveredAdAccount { id: string; name: string; currency?: string }
interface DiscoveredPhoneNumber { id: string; displayPhoneNumber: string; verifiedName: string }
interface DiscoveredWaba { id: string; name: string; phoneNumbers: DiscoveredPhoneNumber[] }
interface PendingAssignment { adAccountId?: string; phoneNumberId?: string }

function MetaConnections() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  const { data: statusData, mutate: reloadStatus } = useSWR("/api/meta/status", fetcher, swrConfig);
  const slots: SlotStatus[] = statusData?.slots || SLOTS.map((slot) => ({ slot, connected: false, label: null, expiresAt: null, daysUntilExpiry: null }));

  const [connectError, setConnectError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [pendingData, setPendingData] = useState<{ connectedByName: string | null; adAccounts: DiscoveredAdAccount[]; wabas: DiscoveredWaba[] } | null>(null);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [assignments, setAssignments] = useState<Partial<Record<Slot, PendingAssignment>>>({});
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [disconnectingSlot, setDisconnectingSlot] = useState<Slot | null>(null);

  // Strip meta_pending/meta_error from the URL once read, same pattern the
  // old code used for meta_error — these are one-shot redirect params, not
  // durable page state.
  useEffect(() => {
    const error = searchParams.get("meta_error");
    const pending = searchParams.get("meta_pending");

    if (error) {
      setConnectError(decodeURIComponent(error));
      const url = new URL(window.location.href);
      url.searchParams.delete("meta_error");
      router.replace(url.pathname + url.search);
    }
    if (pending) {
      setPendingId(pending);
      const url = new URL(window.location.href);
      url.searchParams.delete("meta_pending");
      router.replace(url.pathname + url.search);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!pendingId || !user) return;
    setPendingLoading(true);
    setPendingError(null);
    user.getIdToken().then((idToken) =>
      fetch(`/api/meta/pending/${pendingId}`, { headers: { Authorization: `Bearer ${idToken}` } })
        .then((r) => r.json())
        .then((d) => {
          if (d.success) setPendingData(d);
          else setPendingError(d.error || "Failed to load discovered accounts");
        })
        .catch((e) => setPendingError(e.message || "Failed to load discovered accounts"))
        .finally(() => setPendingLoading(false))
    );
  }, [pendingId, user]);

  const handleConnect = async () => {
    if (!user) return;
    setConnecting(true);
    try {
      const idToken = await user.getIdToken();
      window.location.href = `/api/meta/connect?idToken=${encodeURIComponent(idToken)}`;
    } catch (e: any) {
      setConnectError(e.message || "Could not start login");
      setConnecting(false);
    }
  };

  const handleAssignmentChange = (slot: Slot, field: keyof PendingAssignment, value: string) => {
    setAssignments((prev) => ({ ...prev, [slot]: { ...prev[slot], [field]: value || undefined } }));
  };

  const handleSaveSelection = async () => {
    if (!user || !pendingId) return;
    const nonEmpty = Object.fromEntries(
      Object.entries(assignments).filter(([, v]) => v?.adAccountId || v?.phoneNumberId)
    );
    if (Object.keys(nonEmpty).length === 0) {
      setPendingError("Assign at least one ad account or WhatsApp number to a slot before saving.");
      return;
    }
    setSaving(true);
    setPendingError(null);
    try {
      const idToken = await user.getIdToken();
      const res = await fetch("/api/meta/select", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ pendingId, assignments: nonEmpty }),
      });
      const d = await res.json();
      if (!res.ok || !d.success) throw new Error(d.error || "Failed to save");
      setPendingId(null);
      setPendingData(null);
      setAssignments({});
      reloadStatus();
    } catch (e: any) {
      setPendingError(e.message || "Failed to save selection");
    } finally {
      setSaving(false);
    }
  };

  const handleDisconnect = async (slot: Slot) => {
    if (!user) return;
    setDisconnectingSlot(slot);
    try {
      const idToken = await user.getIdToken();
      await fetch("/api/meta/disconnect", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ slot }),
      });
      reloadStatus();
    } finally {
      setDisconnectingSlot(null);
    }
  };

  const anyConnected = slots.some((s) => s.connected);
  const expiringSoon = slots.filter((s) => s.connected && s.daysUntilExpiry !== null && s.daysUntilExpiry <= 7);

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden mb-6">
      <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Meta Connection</h2>
          <p className="text-sm text-gray-500">Campaigns, leads, and WhatsApp all use this login.</p>
        </div>
        <button
          onClick={handleConnect}
          disabled={connecting || !user}
          className="flex items-center gap-2 px-4 py-2 bg-[#1877F2] text-white rounded-lg hover:bg-[#1567d3] disabled:opacity-50 text-sm font-medium"
        >
          {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Facebook className="w-4 h-4" />}
          {anyConnected ? "Connect another account" : "Connect with Facebook"}
        </button>
      </div>

      {connectError && (
        <div className="m-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-3">
          <XCircle className="w-4 h-4 text-red-500 shrink-0" />
          <span className="text-red-700 text-sm flex-1">{connectError}</span>
          <button onClick={() => setConnectError(null)} className="text-red-500 hover:text-red-700"><XCircle className="w-4 h-4" /></button>
        </div>
      )}

      {expiringSoon.length > 0 && (
        <div className="m-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <p className="text-sm text-amber-800">
            {expiringSoon.map((s) => `Account ${s.slot}`).join(", ")} expiring soon — reconnect before it stops working.
          </p>
        </div>
      )}

      {/* Asset picker — shown right after a login redirect, until assigned to a slot */}
      {pendingId && (
        <div className="m-4 p-4 border border-blue-200 bg-blue-50 rounded-lg">
          <h3 className="font-semibold text-blue-900 mb-1">Choose what each account slot uses</h3>
          {pendingData?.connectedByName && (
            <p className="text-sm text-blue-700 mb-3">Signed in as {pendingData.connectedByName} on Facebook.</p>
          )}
          {pendingLoading ? (
            <div className="flex items-center gap-2 text-sm text-blue-700 py-4"><Loader2 className="w-4 h-4 animate-spin" /> Loading discovered accounts…</div>
          ) : pendingError ? (
            <p className="text-sm text-red-600">{pendingError}</p>
          ) : pendingData ? (
            <>
              <div className="space-y-3">
                {SLOTS.map((slot) => (
                  <div key={slot} className="bg-white rounded-lg border border-blue-100 p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Account {slot} — Ad Account</label>
                      <select
                        value={assignments[slot]?.adAccountId || ""}
                        onChange={(e) => handleAssignmentChange(slot, "adAccountId", e.target.value)}
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                      >
                        <option value="">Not used</option>
                        {pendingData.adAccounts.map((a) => (
                          <option key={a.id} value={a.id}>{a.name} ({a.id})</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Account {slot} — WhatsApp Number</label>
                      <select
                        value={assignments[slot]?.phoneNumberId || ""}
                        onChange={(e) => handleAssignmentChange(slot, "phoneNumberId", e.target.value)}
                        className="w-full px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                      >
                        <option value="">Not used</option>
                        {pendingData.wabas.flatMap((w) => w.phoneNumbers.map((p) => (
                          <option key={p.id} value={p.id}>{p.displayPhoneNumber} — {p.verifiedName}</option>
                        )))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-4">
                <button
                  onClick={handleSaveSelection}
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm font-medium flex items-center gap-2"
                >
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save
                </button>
                <button
                  onClick={() => { setPendingId(null); setPendingData(null); setAssignments({}); }}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
                >
                  Cancel
                </button>
              </div>
            </>
          ) : null}
        </div>
      )}

      <div className="divide-y divide-gray-100">
        {slots.map((s) => (
          <div key={s.slot} className="p-4 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <div className={`w-2.5 h-2.5 rounded-full ${s.connected ? "bg-green-500" : "bg-gray-300"}`} />
              <div>
                <p className="font-medium text-gray-900">Account {s.slot}{s.label ? ` — ${s.label}` : ""}</p>
                <p className="text-xs text-gray-500 flex items-center gap-1.5">
                  {s.connected ? (
                    <>
                      <CheckCircle2 className="w-3 h-3 text-green-600" />
                      Connected
                      {s.daysUntilExpiry !== null && (
                        <span className={s.daysUntilExpiry <= 7 ? "text-amber-600 font-medium" : ""}>
                          · expires in {s.daysUntilExpiry}d
                        </span>
                      )}
                    </>
                  ) : (
                    <>
                      <Clock className="w-3 h-3 text-gray-400" />
                      Not connected — using environment variables, if configured
                    </>
                  )}
                </p>
              </div>
            </div>
            {s.connected && (
              <button
                onClick={() => handleDisconnect(s.slot)}
                disabled={disconnectingSlot === s.slot}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"
              >
                {disconnectingSlot === s.slot ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Unlink className="w-3.5 h-3.5" />}
                Disconnect
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex items-center gap-2 text-xs text-gray-500">
        <RefreshCw className="w-3 h-3" />
        Meta logins expire after about 60 days — reconnect from here when the warning above appears.
      </div>
    </div>
  );
}

function SettingsContent() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(false);
  }, []);

  const {
    browserNotificationsEnabled,
    soundEnabled,
    backgroundPushEnabled,
    toggleBrowserNotifications,
    toggleSound,
    toggleBackgroundPush,
  } = useNotifications();

  if (!user) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Please login to manage accounts</p>
      </div>
    );
  }

  if (loading) {
    return <FormSkeleton fields={4} />;
  }

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-gray-600">Manage your Meta Business accounts</p>
      </div>

      <MetaConnections />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-3 mb-6">
              <User className="w-5 h-5 text-gray-400" />
              <h2 className="text-lg font-semibold text-gray-900">Profile</h2>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Display Name</label>
                <input type="text" defaultValue={user?.displayName || ''} className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                <input type="email" defaultValue={user?.email || ''} className="w-full px-4 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            <div className="flex items-center gap-3 mb-6">
              <Bell className="w-5 h-5 text-gray-400" />
              <h2 className="text-lg font-semibold text-gray-900">Notifications</h2>
            </div>
            <div className="space-y-4">
              <label className="flex items-center justify-between gap-3">
                <span className="text-gray-700">Browser notifications</span>
                <input
                  type="checkbox"
                  checked={browserNotificationsEnabled}
                  onChange={toggleBrowserNotifications}
                  className="w-5 h-5 text-blue-600"
                />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span className="text-gray-700">Sound alerts</span>
                <input
                  type="checkbox"
                  checked={soundEnabled}
                  onChange={toggleSound}
                  className="w-5 h-5 text-blue-600"
                />
              </label>
              <label className="flex items-center justify-between gap-3">
                <span className="text-gray-700">Background push (FCM)</span>
                <input
                  type="checkbox"
                  checked={backgroundPushEnabled}
                  onChange={toggleBackgroundPush}
                  className="w-5 h-5 text-blue-600"
                />
              </label>
            </div>
            <p className="text-sm text-gray-500 mt-3">
              Browser notifications work when the app is open in a browser tab. Background push is the fallback for when the browser is closed.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsFallback() {
  return <FormSkeleton fields={4} />;
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<SettingsFallback />}>
      <SettingsContent />
    </Suspense>
  );
}
