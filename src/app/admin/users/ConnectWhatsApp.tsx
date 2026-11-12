"use client";

import { useState } from "react";

import { ErrorBox, Field } from "@/components/auth";
import { btn, Modal } from "@/components/ui/Modal";
import { api } from "@/lib/api";
import type { AdminUser } from "../ui";

const EMPTY = { wabaId: "", phoneNumberId: "", accessToken: "" };

/** Admin form: paste a client's Meta IDs and token; the server checks them with Meta before saving. */
export function ConnectWhatsApp({ user, onClose, onDone }: { user: AdminUser | null; onClose: () => void; onDone: (msg: string) => void }) {
  const [f, setF] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const close = () => (setF(EMPTY), setError(""), onClose());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api<{ whatsapp: { displayPhone: string } }>(`/api/admin/workspaces/${user!.workspace.id}/whatsapp`, { method: "PUT", body: f });
      close();
      onDone(`${r.whatsapp.displayPhone} connected to ${user!.workspace.name}.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={!!user} onClose={close} title={`Connect WhatsApp · ${user?.workspace.name ?? ""}`}>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-muted">
          From the client&apos;s Meta Business Manager. We check these with Meta before saving, and the token is stored encrypted.
        </p>
        <ErrorBox message={error} />
        <Field label="WhatsApp Business Account ID" inputMode="numeric" required value={f.wabaId} onChange={set("wabaId")}
          hint="WhatsApp Manager → Account tools → Phone numbers, shown above the list." />
        <Field label="Phone number ID" inputMode="numeric" required value={f.phoneNumberId} onChange={set("phoneNumberId")}
          hint="Meta app → WhatsApp → API Setup, under the number." />
        <Field label="Permanent access token" type="password" autoComplete="off" required value={f.accessToken} onChange={set("accessToken")}
          hint="A System User token with whatsapp_business_messaging and whatsapp_business_management." />
        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className={btn.secondary} onClick={close}>Cancel</button>
          <button type="submit" className={btn.primary} disabled={busy}>{busy ? "Checking with Meta…" : "Verify and connect"}</button>
        </div>
      </form>
    </Modal>
  );
}
