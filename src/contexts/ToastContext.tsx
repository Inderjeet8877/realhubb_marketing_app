"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { Alert, type AlertStatus } from "@/components/ui/Alert";

export type ToastType = "success" | "error" | "warning" | "info";

const TYPE_TO_STATUS: Record<ToastType, AlertStatus> = {
  success: "success",
  error: "danger",
  warning: "warning",
  info: "info",
};

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextType>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

// Replaces window.alert() with an in-app toast stack, rendered as the local
// Alert compound component (@/components/ui/Alert — plain Tailwind, no
// external UI library) — the browser's native alert() renders as an
// unstyled OS dialog ("www.realhubb.co.in says…"), which blocks the whole
// page until dismissed. This is non-blocking and self-dismisses.
export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, type: ToastType = "info") => {
    const id = `t${Date.now()}-${counter.current++}`;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => dismiss(id), 5000);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div
        aria-live="polite"
        className="fixed top-[calc(0.75rem+env(safe-area-inset-top))] inset-x-3 sm:inset-x-auto sm:right-4 sm:left-auto sm:top-4 z-[100] flex flex-col gap-2 sm:w-96 pointer-events-none"
      >
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto animate-modal-in">
            <Alert status={TYPE_TO_STATUS[t.type]} onClose={() => dismiss(t.id)} className="shadow-lg">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>{t.message}</Alert.Description>
              </Alert.Content>
            </Alert>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
