"use client";

import { useEffect, useState, useCallback } from "react";
import { Bell, BellOff, X, MessageSquare } from "lucide-react";

interface ToastMsg {
  id: number;
  title: string;
  body: string;
}

export default function NotificationSetup() {
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");
  const [showBanner, setShowBanner] = useState(false);
  const [toasts, setToasts] = useState<ToastMsg[]>([]);

  const addToast = useCallback((title: string, body: string) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, title, body }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 6000);
  }, []);

  const registerToken = useCallback(async () => {
    try {
      const { getMessaging, getToken, onMessage } = await import("firebase/messaging");
      const { app } = await import("@/lib/firebase");

      const sw = await navigator.serviceWorker.register("/firebase-messaging-sw.js", { scope: "/" });
      const messaging = getMessaging(app);

      const token = await getToken(messaging, {
        vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
        serviceWorkerRegistration: sw,
      });

      if (token) {
        await fetch("/api/notifications/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        localStorage.setItem("fcm_registered", "1");
        console.log("[FCM] Token registered");
      }

      // Foreground message handler
      onMessage(messaging, (payload) => {
        const title = payload.notification?.title || "New WhatsApp Message";
        const body  = payload.notification?.body  || "";
        addToast(title, body);
      });
    } catch (err) {
      console.error("[FCM] Setup error:", err);
    }
  }, [addToast]);

  useEffect(() => {
    // FCM only works in browsers that support it
    if (typeof Notification === "undefined" || typeof navigator === "undefined") {
      setPermission("unsupported");
      return;
    }

    const current = Notification.permission;
    setPermission(current);

    if (current === "granted") {
      // Already granted — re-register silently (token can rotate)
      registerToken();
    } else if (current === "default" && !localStorage.getItem("notif_banner_dismissed")) {
      // Show the banner once
      setShowBanner(true);
    }
  }, [registerToken]);

  const handleEnable = async () => {
    setShowBanner(false);
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === "granted") {
      await registerToken();
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
      {/* Permission banner — shown once when permission is "default" */}
      {showBanner && permission === "default" && (
        <div className="fixed bottom-20 sm:bottom-4 left-3 right-3 sm:left-auto sm:right-4 sm:w-96 z-50 bg-white border border-gray-200 rounded-xl shadow-xl p-4 flex items-start gap-3 animate-in slide-in-from-bottom-4">
          <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
            <Bell className="w-5 h-5 text-green-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900">Enable notifications</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Get notified instantly when a customer replies on WhatsApp — even when the app is closed.
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleEnable}
                className="px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700"
              >
                Enable
              </button>
              <button
                onClick={dismissBanner}
                className="px-3 py-1.5 text-gray-500 text-xs hover:text-gray-700"
              >
                Not now
              </button>
            </div>
          </div>
          <button onClick={dismissBanner} className="text-gray-400 hover:text-gray-600 flex-shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* In-app toast stack */}
      <div className="fixed bottom-20 sm:bottom-4 right-3 sm:right-4 z-50 flex flex-col gap-2 max-w-xs w-full pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto bg-white border border-gray-200 rounded-xl shadow-xl p-3 flex items-start gap-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#25d366" }}>
              <MessageSquare className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-gray-900 truncate">{t.title}</p>
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{t.body}</p>
            </div>
            <button onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
              className="text-gray-300 hover:text-gray-500 flex-shrink-0">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>
    </>
  );
}
