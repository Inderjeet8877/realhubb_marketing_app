"use client";

import { createContext, useContext, useState, useCallback, useEffect, ReactNode } from "react";

interface NotificationPreferences {
  browserNotificationsEnabled: boolean;
  soundEnabled: boolean;
  backgroundPushEnabled: boolean;
}

interface NotificationContextValue extends NotificationPreferences {
  unreadCount: number;
  incrementUnread: () => void;
  clearUnread: () => void;
  toggleBrowserNotifications: () => void;
  toggleSound: () => void;
  toggleBackgroundPush: () => void;
}

const DEFAULT_PREFERENCES: NotificationPreferences = {
  browserNotificationsEnabled: true,
  soundEnabled: true,
  backgroundPushEnabled: true,
};

const STORAGE_KEY = "notification_preferences";

const NotificationContext = createContext<NotificationContextValue>({
  unreadCount: 0,
  incrementUnread: () => {},
  clearUnread: () => {},
  browserNotificationsEnabled: DEFAULT_PREFERENCES.browserNotificationsEnabled,
  soundEnabled: DEFAULT_PREFERENCES.soundEnabled,
  backgroundPushEnabled: DEFAULT_PREFERENCES.backgroundPushEnabled,
  toggleBrowserNotifications: () => {},
  toggleSound: () => {},
  toggleBackgroundPush: () => {},
});

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [preferences, setPreferences] = useState<NotificationPreferences>(DEFAULT_PREFERENCES);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as NotificationPreferences;
        setPreferences({ ...DEFAULT_PREFERENCES, ...parsed });
      }
    } catch (err) {
      console.error("[NotificationPreferences] failed to load", err);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
  }, [loaded, preferences]);

  const incrementUnread = useCallback(() => setUnreadCount(n => n + 1), []);
  const clearUnread = useCallback(() => setUnreadCount(0), []);

  const toggleBrowserNotifications = useCallback(() => {
    setPreferences((current) => ({
      ...current,
      browserNotificationsEnabled: !current.browserNotificationsEnabled,
    }));
  }, []);

  const toggleSound = useCallback(() => {
    setPreferences((current) => ({
      ...current,
      soundEnabled: !current.soundEnabled,
    }));
  }, []);

  const toggleBackgroundPush = useCallback(() => {
    setPreferences((current) => ({
      ...current,
      backgroundPushEnabled: !current.backgroundPushEnabled,
    }));
  }, []);

  return (
    <NotificationContext.Provider
      value={{
        unreadCount,
        incrementUnread,
        clearUnread,
        browserNotificationsEnabled: preferences.browserNotificationsEnabled,
        soundEnabled: preferences.soundEnabled,
        backgroundPushEnabled: preferences.backgroundPushEnabled,
        toggleBrowserNotifications,
        toggleSound,
        toggleBackgroundPush,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
