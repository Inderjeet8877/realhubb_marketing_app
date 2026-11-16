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
        <div
          role="alertdialog"
          aria-label={pending.title || "Confirm"}
          className="fixed top-[calc(0.75rem+env(safe-area-inset-top))] inset-x-3 sm:inset-x-auto sm:right-4 sm:left-auto sm:top-4 z-[110] sm:w-96 animate-modal-in"
        >
          <Alert status={pending.tone === "danger" ? "danger" : "info"} className="shadow-lg">
            <Alert.Indicator />
            <Alert.Content>
              {pending.title && <Alert.Title>{pending.title}</Alert.Title>}
              <Alert.Description>{pending.message}</Alert.Description>
              <div className="flex justify-end gap-2 mt-3">
                <button
                  onClick={() => handle(false)}
                  className="btn btn-sm btn-secondary"
                >
                  {pending.cancelLabel || "Cancel"}
                </button>
                <button
                  onClick={() => handle(true)}
                  className={`btn btn-sm ${pending.tone === "danger" ? "btn-danger" : "btn-primary"}`}
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
