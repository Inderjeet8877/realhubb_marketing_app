"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { Alert } from "@/components/ui/Alert";

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
// confirm() dialog is an unstyled OS-level popup out of place next to the
// rest of this app. Rendered as a top-anchored local Alert (same slot/
// position as toasts) rather than a center-screen modal, per explicit
// preference — window.confirm() is synchronous; this is Promise-based
// instead (`if (!(await confirm("..."))) return;`), so every call site
// using it needs its enclosing function to be async.
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
        <div className="fixed top-4 inset-x-4 sm:inset-x-auto sm:right-4 sm:left-auto z-[110] sm:w-96 animate-fade-in">
          <Alert status={pending.tone === "danger" ? "danger" : "info"}>
            <Alert.Indicator />
            <Alert.Content>
              {pending.title && <Alert.Title>{pending.title}</Alert.Title>}
              <Alert.Description>{pending.message}</Alert.Description>
              <div className="flex justify-end gap-2 mt-3">
                <button
                  onClick={() => handle(false)}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 bg-white"
                >
                  {pending.cancelLabel || "Cancel"}
                </button>
                <button
                  onClick={() => handle(true)}
                  className={`px-3 py-1.5 text-sm font-medium text-white rounded-lg ${
                    pending.tone === "danger" ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
                  }`}
                >
                  {pending.confirmLabel || "Confirm"}
                </button>
              </div>
            </Alert.Content>
          </Alert>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
