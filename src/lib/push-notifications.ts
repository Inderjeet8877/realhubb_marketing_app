// Shared FCM push helper — extracted from the WhatsApp webhook (which sends
// one to every registered admin device on each inbound message) so a second
// event source (new website enquiries) can reuse the exact same send/cleanup
// logic instead of duplicating it.

import { getMessaging } from 'firebase-admin/messaging';
import { getApps } from 'firebase-admin/app';
import { adminDb } from '@/lib/firebase-admin';

export async function sendPushNotification(
  title: string,
  body: string,
  options?: { link?: string; channelId?: string }
) {
  const snap = await adminDb.collection('fcm_tokens').get();
  if (snap.empty) return;

  const tokens = snap.docs.map((d) => d.data().token as string).filter(Boolean);
  if (tokens.length === 0) return;

  const app = getApps()[0];
  if (!app) return;

  const messaging = getMessaging(app);

  const response = await messaging.sendEachForMulticast({
    tokens,
    notification: {
      title,
      body: body.slice(0, 120),
    },
    android: {
      // Explicit high priority so this wakes the device out of Doze rather than
      // waiting for the next maintenance window — the default is already high for
      // notification-payload messages, but this removes any ambiguity. Note: this
      // cannot override an OEM (e.g. Samsung/MIUI) killing the app's background
      // process via its own battery manager — that's a device setting, not FCM.
      priority: 'high',
      notification: {
        channelId: options?.channelId || 'general',
        defaultVibrateTimings: true,
        visibility: 'public',
        // Belt-and-suspenders alongside the client's notification channel
        // (which already sets its own sound) — on Android 8+ the channel's
        // sound takes precedence once the channel exists, but this covers
        // older Android versions and any device where channel creation
        // hasn't happened yet. FCM expects the raw resource name without
        // its extension here (res/raw/notification_sound.mp3).
        sound: 'notification_sound',
      },
    },
    webpush: {
      notification: {
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        vibrate: [200, 100, 200],
        requireInteraction: false,
      },
      fcmOptions: options?.link ? { link: options.link } : undefined,
    },
  });

  // Remove tokens that are no longer valid
  const stale = response.responses
    .map((r, i) => (!r.success ? tokens[i] : null))
    .filter(Boolean) as string[];

  for (const token of stale) {
    await adminDb.collection('fcm_tokens').doc(token).delete().catch(() => {});
  }

  console.log(`[FCM] Sent to ${tokens.length} devices, ${stale.length} stale removed`);
}
