"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import Alert from "@mui/material/Alert";

export type ToastType = "success" | "error" | "warning" | "info";

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

// Replaces window.alert() with an in-app toast stack, rendered as MUI Alerts
// (severity maps 1:1 onto our ToastType) — the browser's native alert()
// renders as an unstyled OS dialog ("www.realhubb.co.in says…"), which
// blocks the whole page until dismissed. This is non-blocking and
// self-dismisses.
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
      <div className="fixed top-4 inset-x-4 sm:inset-x-auto sm:right-4 sm:left-auto z-[100] flex flex-col gap-2 sm:w-96 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto animate-fade-in">
            <Alert severity={t.type} onClose={() => dismiss(t.id)} sx={{ boxShadow: 3 }}>
              {t.message}
            </Alert>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
