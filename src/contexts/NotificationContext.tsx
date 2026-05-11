"use client";

import { createContext, useContext, useState, useCallback, ReactNode } from "react";

interface NotificationContextValue {
  unreadCount: number;
  incrementUnread: () => void;
  clearUnread: ()  => void;
}

const NotificationContext = createContext<NotificationContextValue>({
  unreadCount:     0,
  incrementUnread: () => {},
  clearUnread:     () => {},
});

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [unreadCount, setUnreadCount] = useState(0);

  const incrementUnread = useCallback(() => setUnreadCount(n => n + 1), []);
  const clearUnread     = useCallback(() => setUnreadCount(0), []);

  return (
    <NotificationContext.Provider value={{ unreadCount, incrementUnread, clearUnread }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
