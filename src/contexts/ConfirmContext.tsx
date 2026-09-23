"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { AlertTriangle } from "lucide-react";

interface ConfirmOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "default";
}

interface ConfirmContextType {
  confirm: (message: string, options?: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType>({ confirm: async () => false });

export function useConfirm() {
  return useContext(ConfirmContext);
}

interface PendingConfirm extends ConfirmOptions {
  message: string;
  resolve: (value: boolean) => void;
}

// Replaces window.confirm() — same reasoning as ToastContext: a native
// confirm() dialog is an unstyled OS-level popup, out of place next to the
// rest of this app. window.confirm() is synchronous; this is Promise-based
// instead (`if (!(await confirm("..."))) return;`), so every call site using
// it needs its enclosing function to be async — already true everywhere
// this is actually used in this app (delete/cancel handlers already await
// fetch calls).
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback((message: string, options?: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setPending({ message, resolve, ...options });
    });
  }, []);

  const handle = (result: boolean) => {
    pending?.resolve(result);
    setPending(null);
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {pending && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[110] p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-sm w-full p-6 animate-modal-in">
            <div className="flex items-start gap-3 mb-4">
              <div className={`p-2 rounded-full shrink-0 ${pending.tone === "danger" ? "bg-red-100" : "bg-blue-100"}`}>
                <AlertTriangle className={`w-5 h-5 ${pending.tone === "danger" ? "text-red-600" : "text-blue-600"}`} />
              </div>
              <div>
                {pending.title && <p className="font-semibold text-gray-900 mb-1">{pending.title}</p>}
                <p className="text-sm text-gray-700">{pending.message}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => handle(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                {pending.cancelLabel || "Cancel"}
              </button>
              <button
                onClick={() => handle(true)}
                className={`px-4 py-2 text-sm font-medium text-white rounded-lg ${
                  pending.tone === "danger" ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
                }`}
              >
                {pending.confirmLabel || "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
