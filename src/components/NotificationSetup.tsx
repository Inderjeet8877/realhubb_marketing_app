"use client";

import { useEffect, useState, useCallback } from "react";
import { Bell, X, MessageSquare } from "lucide-react";
import { db } from "@/lib/firebase";
import { collection, query, orderBy, limit, onSnapshot } from "firebase/firestore";
import { useRouter } from "next/navigation";
import { useNotifications } from "@/contexts/NotificationContext";

interface ToastMsg {
  id:    number;
  name:  string;
  body:  string;
  phone: string;
}

// ── Web Audio ping (no audio file needed) ─────────────────────────────────
function playPing() {
  try {
    const ac   = new (window.AudioContext || (window as any).webkitAudioContext)();
    const now  = ac.currentTime;

    function tone(freq: number, start: number, duration: number, vol: number) {
      const osc  = ac.createOscillator();
      const gain = ac.createGain();
      osc.connect(gain);
      gain.connect(ac.destination);
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(vol, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      osc.start(start);
      osc.stop(start + duration);
    }

    tone(880,  now,       0.35, 0.35); // first ping
    tone(1100, now + 0.18, 0.35, 0.3); // second ping (brighter)
    setTimeout(() => ac.close(), 800);
  } catch {}
}

// ── Fire a browser notification (works when tab not focused) ─────────────
function fireBrowserNotification(name: string, body: string, phone: string) {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;

  const notif = new Notification(`💬 ${name}`, {
    body,
    icon:              "/favicon.ico",
    badge:             "/favicon.ico",
    tag:               `wa-${phone}`,      // collapses duplicate notifs per contact
    requireInteraction: false,
    silent:            true,               // we play our own sound
  });

  // Click → focus tab and navigate to inbox
  notif.onclick = () => {
    window.focus();
    window.location.href = "/dashboard/whatsapp";
  };

  // Auto-close after 8 s
  setTimeout(() => notif.close(), 8000);
}

export default function NotificationSetup() {
  const router              = useRouter();
  const {
    incrementUnread,
    browserNotificationsEnabled,
    soundEnabled,
    backgroundPushEnabled,
  } = useNotifications();
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [showBanner, setShowBanner] = useState(false);
  const [toasts, setToasts] = useState<ToastMsg[]>([]);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);

  const addToast = useCallback((name: string, body: string, phone: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, name, body, phone }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 7000);
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  // ── FCM registration (background push when app is closed) ────────────
  const registerFCM = useCallback(async () => {
    if (typeof navigator === "undefined") return;

    // Inside the Capacitor native app shell — use native push instead of the web
    // Notification/serviceWorker APIs. Native push works even when the app is fully
    // closed; web push in an embedded WebView is not reliably delivered in that state,
    // which defeats the whole point of wrapping this as an app (never miss a lead reply).
    const isNative = typeof window !== "undefined" && (window as any).Capacitor?.isNativePlatform?.();
    if (isNative) {
      try {
        const { PushNotifications } = await import("@capacitor/push-notifications");
        const perm = await PushNotifications.requestPermissions();
        if (perm.receive !== "granted") return;

        await PushNotifications.register();

        PushNotifications.addListener("registration", async (token) => {
          await fetch("/api/notifications/register", {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ token: token.value }),
          });
          localStorage.setItem("fcm_registered", "1");
          localStorage.setItem("fcm_device_token", token.value);
        });

        PushNotifications.addListener("registrationError", (err) => {
          console.error("[Native Push] registration error:", err);
        });

        // Foreground handler — background delivery is handled by the OS/FCM directly.
        PushNotifications.addListener("pushNotificationReceived", (notification) => {
          const name = notification.title?.replace("💬 ", "") || "WhatsApp";
          const body = notification.body || "";
          addToast(name, body, "native");
        });

        // Tapping the notification (from background/killed state) should open the inbox.
        PushNotifications.addListener("pushNotificationActionPerformed", () => {
          router.push("/dashboard/whatsapp");
        });
      } catch (err) {
        console.error("[Native Push] setup error:", err);
      }
      return;
    }

    if (!("serviceWorker" in navigator)) return;
    try {
      const { getMessaging, getToken, onMessage } = await import("firebase/messaging");
      const { app } = await import("@/lib/firebase");
      const sw      = await navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/" });
      const messaging = getMessaging(app);
      const token   = await getToken(messaging, {
        vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
        serviceWorkerRegistration: sw,
      });
      if (token) {
        await fetch("/api/notifications/register", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ token }),
        });
        localStorage.setItem("fcm_registered", "1");
        localStorage.setItem("fcm_device_token", token);
      }
      // FCM foreground handler — fires when tab is in foreground and FCM delivers
      onMessage(messaging, (payload) => {
        const name = payload.notification?.title?.replace("💬 ", "") || "WhatsApp";
        const body = payload.notification?.body || "";
        // Only show if we haven't already shown via Firestore listener
        // (FCM and Firestore may both fire for the same message)
        addToast(name, body, "fcm");
      });
    } catch (err) {
      console.error("[FCM] setup error:", err);
    }
  }, [addToast, router]);

  // ── Primary: Firestore real-time listener ─────────────────────────────
  // Fires the instant the webhook writes a new inbound message to Firestore.
  // This is more reliable than FCM when the app tab is open.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const initialized = { done: false };

    const q    = query(
      collection(db, "whatsapp_conversations"),
      orderBy("createdAt", "desc"),
      limit(20)
    );

    const unsub = onSnapshot(q, (snap) => {
      // Skip the very first snapshot (that's all existing messages, not new ones)
      if (!initialized.done) {
        initialized.done = true;
        return;
      }

      snap.docChanges().forEach((change) => {
        if (change.type !== "added") return;
        const d = change.doc.data();
        if (d.direction !== "inbound") return;

        const name = (d.name && d.name !== d.phone) ? d.name : d.phone;
        const body = d.message || "[New message]";
        const phone = d.phone || "";

        // 1. In-app toast
        addToast(name, body, phone);

        // 2. Browser notification (works even on a different tab)
        if (browserNotificationsEnabled) {
          fireBrowserNotification(name, body, phone);
        }

        // 3. Sound
        if (soundEnabled) {
          playPing();
        }

        // 4. Increment global unread badge
        incrementUnread();

        console.log(`[Notification] New inbound from ${name}: ${body.slice(0, 60)}`);
      });
    }, (err) => {
      console.error("[Notification] Firestore listener error:", err);
    });

    return () => unsub();
  }, [addToast, incrementUnread, browserNotificationsEnabled, soundEnabled]);

  // ── Permission & FCM setup ─────────────────────────────────────────────
  useEffect(() => {
    if (typeof Notification === "undefined") {
      setPermission("unsupported");
      return;
    }
    const current = Notification.permission;
    setPermission(current);

    if (current === "granted" && backgroundPushEnabled) {
      registerFCM();
    } else if (current === "default" && browserNotificationsEnabled && !localStorage.getItem("notif_banner_dismissed")) {
      setShowBanner(true);
    }
  }, [registerFCM, backgroundPushEnabled, browserNotificationsEnabled]);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    if (backgroundPushEnabled) return;

    const token = localStorage.getItem("fcm_device_token");
    if (!token) return;

    fetch("/api/notifications/register", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).catch(() => {});

    localStorage.removeItem("fcm_device_token");
    navigator.serviceWorker.getRegistration("/firebase-messaging-sw.js")
      .then((registration) => registration?.unregister())
      .catch(() => {});
  }, [backgroundPushEnabled]);

  // ── PWA Install Prompt ─────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window === "undefined") return;

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setTimeout(() => setShowInstallPrompt(true), 2000);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  const handleInstallApp = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === "accepted") {
      setDeferredPrompt(null);
      setShowInstallPrompt(false);
    }
  };

  const dismissInstallPrompt = () => {
    setShowInstallPrompt(false);
    localStorage.setItem("pwa_install_dismissed", "1");
  };

  const handleEnable = async () => {
    setShowBanner(false);
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") {
      await registerFCM();
    } else {
      localStorage.setItem("notif_banner_dismissed", "1");
    }
  };

  const dismissBanner = () => {
    setShowBanner(false);
    localStorage.setItem("notif_banner_dismissed", "1");
  };

  return (
    <>
      {/* ── Permission banner ── */}
      {showBanner && permission === "default" && (
        <div className="fixed bottom-20 sm:bottom-4 left-3 right-3 sm:left-auto sm:right-4 sm:w-96 z-50 bg-white border border-gray-200 rounded-xl shadow-xl p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
            <Bell className="w-5 h-5 text-green-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">Enable notifications</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Get notified instantly when a customer replies on WhatsApp.
            </p>
            <div className="flex gap-2 mt-3">
              <button onClick={handleEnable}
                className="px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700">
                Enable
              </button>
              <button onClick={dismissBanner}
                className="px-3 py-1.5 text-gray-500 text-xs hover:text-gray-700">
                Not now
              </button>
            </div>
          </div>
          <button onClick={dismissBanner} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── PWA Install Prompt ── */}
      {showInstallPrompt && !localStorage.getItem("pwa_install_dismissed") && (
        <div className="fixed bottom-20 sm:bottom-4 left-3 right-3 sm:left-auto sm:right-4 sm:w-96 z-50 bg-white border border-blue-200 rounded-xl shadow-xl p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
            <MessageSquare className="w-5 h-5 text-blue-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">Install Realhubb</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Add to your home screen for faster access and better notifications on mobile.
            </p>
            <div className="flex gap-2 mt-3">
              <button onClick={handleInstallApp}
                className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700">
                Install
              </button>
              <button onClick={dismissInstallPrompt}
                className="px-3 py-1.5 text-gray-500 text-xs hover:text-gray-700">
                Not now
              </button>
            </div>
          </div>
          <button onClick={dismissInstallPrompt} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ── In-app toast stack ── */}
      <div className="fixed bottom-20 sm:bottom-4 right-3 sm:right-4 z-50 flex flex-col gap-2 max-w-xs w-full pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className="pointer-events-auto bg-white border border-gray-200 rounded-xl shadow-xl p-3 flex items-start gap-3 cursor-pointer hover:shadow-2xl transition-shadow"
            onClick={() => { removeToast(t.id); router.push("/dashboard/whatsapp"); }}
          >
            <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-white text-sm"
              style={{ backgroundColor: "#25d366" }}>
              {t.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold text-gray-900 truncate">{t.name}</p>
              <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{t.body}</p>
              <p className="text-[10px] text-green-600 mt-1 font-medium">Tap to open inbox →</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); removeToast(t.id); }}
              className="text-gray-300 hover:text-gray-500 flex-shrink-0 mt-0.5"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
