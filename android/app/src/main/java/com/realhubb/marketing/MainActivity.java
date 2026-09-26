package com.realhubb.marketing;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // Creating the notification channel here — at native process start —
    // guarantees it exists (with the custom sound) before any push can
    // possibly arrive, regardless of WebView/JS/network timing. The JS-side
    // PushNotifications.createChannel() call in NotificationSetup.tsx only
    // runs once the live web app has loaded, React has mounted, and
    // permission checks have resolved; a background push can race ahead of
    // all of that, especially right after install/update, and Android falls
    // back to a default channel/sound when the target channel doesn't exist
    // yet. Channel id/name/sound must stay in sync with NotificationSetup.tsx
    // and src/lib/push-notifications.ts. android.app.Notification is used
    // only for the VISIBILITY_PUBLIC constant.
    private static final String CHANNEL_ID = "whatsapp_replies_v2";
    private static final String CHANNEL_NAME = "WhatsApp replies";
    private static final String CHANNEL_DESCRIPTION = "Alerts when a lead replies on WhatsApp";
    private static final String SOUND_RESOURCE_NAME = "notification_sound"; // res/raw/notification_sound.mp3

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createNotificationChannel();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return; // channels are API 26+

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null) return;

        // Idempotent and immutable-after-first-call by design: if this channel
        // id already exists on the device, Android ignores everything below —
        // only the very first creation of a given channel id ever takes effect.
        NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription(CHANNEL_DESCRIPTION);
        channel.enableVibration(true);
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);

        Uri soundUri = Uri.parse("android.resource://" + getPackageName() + "/raw/" + SOUND_RESOURCE_NAME);
        AudioAttributes audioAttributes = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
        channel.setSound(soundUri, audioAttributes);

        manager.createNotificationChannel(channel);
    }
}
