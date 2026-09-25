"use client";

import { createContext, useCallback, useContext, useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";

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
// rest of this app. Rendered as a top-anchored MUI Alert (same slot/position
// as toasts) rather than a center-screen modal, per explicit preference —
// window.confirm() is synchronous; this is Promise-based instead
// (`if (!(await confirm("..."))) return;`), so every call site using it
// needs its enclosing function to be async.
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
          <Alert
            severity={pending.tone === "danger" ? "error" : "info"}
            sx={{ boxShadow: 3, alignItems: "flex-start" }}
          >
            <Stack spacing={1.5}>
              <div>
                {pending.title && <p className="font-semibold mb-0.5">{pending.title}</p>}
                <p className="text-sm">{pending.message}</p>
              </div>
              <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
                <Button size="small" color="inherit" onClick={() => handle(false)}>
                  {pending.cancelLabel || "Cancel"}
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  color={pending.tone === "danger" ? "error" : "primary"}
                  onClick={() => handle(true)}
                >
                  {pending.confirmLabel || "Confirm"}
                </Button>
              </Stack>
            </Stack>
          </Alert>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
