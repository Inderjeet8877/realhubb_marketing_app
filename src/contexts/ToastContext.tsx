"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";

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

const TYPE_STYLES: Record<ToastType, { icon: typeof CheckCircle2; bg: string; border: string; text: string; iconColor: string }> = {
  success: { icon: CheckCircle2, bg: "bg-white", border: "border-green-200", text: "text-gray-900", iconColor: "text-green-600" },
  error:   { icon: XCircle,       bg: "bg-white", border: "border-red-200",   text: "text-gray-900", iconColor: "text-red-600" },
  warning: { icon: AlertTriangle, bg: "bg-white", border: "border-amber-200", text: "text-gray-900", iconColor: "text-amber-600" },
  info:    { icon: Info,          bg: "bg-white", border: "border-blue-200",  text: "text-gray-900", iconColor: "text-blue-600" },
};

// Replaces window.alert() with an in-app toast stack — the browser's native
// alert() renders as an unstyled OS dialog ("www.realhubb.co.in says…"),
// which looks broken next to the rest of this app's design and blocks the
// whole page until dismissed. This is non-blocking and self-dismisses.
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
      <div className="fixed top-4 inset-x-4 sm:inset-x-auto sm:right-4 sm:left-auto z-[100] space-y-2 sm:w-96 pointer-events-none">
        {toasts.map((t) => {
          const style = TYPE_STYLES[t.type];
          const Icon = style.icon;
          return (
            <div
              key={t.id}
              className={`pointer-events-auto flex items-start gap-3 rounded-xl border ${style.border} ${style.bg} shadow-lg p-4 animate-fade-in`}
            >
              <Icon className={`w-5 h-5 mt-0.5 shrink-0 ${style.iconColor}`} />
              <p className={`text-sm flex-1 ${style.text}`}>{t.message}</p>
              <button onClick={() => dismiss(t.id)} className="text-gray-400 hover:text-gray-600 shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
