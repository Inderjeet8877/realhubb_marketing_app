"use client";

import { useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ClipboardList, Inbox, LayoutDashboard, LogOut, ScrollText, ShieldAlert, UserCheck, Users } from "lucide-react";

import { ToastProvider } from "@/contexts/ToastContext";
import { btn } from "@/components/ui/Modal";
import { signOut, useMe } from "@/lib/api";

const NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/requests", label: "Requests", icon: UserCheck },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/enquiries", label: "Enquiries", icon: Inbox },
  { href: "/admin/login-activity", label: "Login activity", icon: ShieldAlert },
  { href: "/admin/audit", label: "Audit log", icon: ScrollText },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { data: me, error } = useMe();
  const isAdmin = me?.user.isPlatformAdmin;

  useEffect(() => {
    if (me && !isAdmin) router.replace("/workspace");
  }, [me, isAdmin, router]);

  const active = (href: string) => (href === "/admin" ? path === href : path.startsWith(href));

  return (
    <ToastProvider>
      <div className="theme-auto min-h-screen bg-bg text-fg lg:flex">
        <aside className="hidden lg:flex lg:flex-col w-60 shrink-0 bg-ink text-white sticky top-0 h-screen">
          <div className="px-5 h-16 flex items-center border-b border-ink-line">
            <Link href="/admin" className="rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
              <Image src="/brand/logo_dark.png" alt="Broadzen" width={141} height={30} priority className="h-7 w-auto" />
            </Link>
          </div>
          <nav aria-label="Admin" className="p-3 space-y-1">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active(n.href) ? "page" : undefined}
                className={`flex items-center gap-3 min-h-[44px] px-3 rounded-lg text-sm font-medium transition-colors duration-fast ${
                  active(n.href) ? "bg-white/10 text-signal-cyan" : "text-white/80 hover:bg-white/5 hover:text-white"
                }`}
              >
                <n.icon className="w-4 h-4" aria-hidden />
                {n.label}
              </Link>
            ))}
          </nav>
          <Link href="/dashboard" className="mt-auto m-3 flex items-center gap-3 min-h-[44px] px-3 rounded-lg text-sm text-white/70 hover:text-white hover:bg-white/5">
            <ClipboardList className="w-4 h-4" aria-hidden /> Realhubb dashboard
          </Link>
        </aside>

        <div className="flex-1 min-w-0">
          <header className="bg-surface border-b border-line">
            <div className="h-16 px-4 sm:px-6 flex items-center justify-between gap-3">
              <Link href="/admin" className="lg:hidden">
                <Image src="/brand/logo_light.png" alt="Broadzen" width={113} height={24} className="h-6 w-auto dark:hidden" />
                <Image src="/brand/logo_dark.png" alt="Broadzen" width={113} height={24} className="hidden h-6 w-auto dark:block" />
              </Link>
              <span className="hidden lg:block text-sm font-semibold text-fg">Admin panel</span>
              <div className="flex items-center gap-3">
                {me && <span className="hidden sm:block text-sm text-muted truncate max-w-[220px]">{me.user.email}</span>}
                <button className={btn.secondary} onClick={() => signOut()}>
                  <LogOut className="w-4 h-4" aria-hidden /> Sign out
                </button>
              </div>
            </div>
            <nav aria-label="Admin" className="lg:hidden flex overflow-x-auto px-2 border-t border-line">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active(n.href) ? "page" : undefined}
                  className={`min-h-[44px] px-3 flex items-center text-sm font-medium whitespace-nowrap border-b-2 ${
                    active(n.href) ? "border-accent text-accent" : "border-transparent text-muted"
                  }`}
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </header>

          <main className="p-4 sm:p-6 max-w-6xl">
            {error && !me ? (
              <p role="alert" className="p-4 rounded-lg border border-danger/30 bg-danger/10 text-sm text-danger">{error.message}</p>
            ) : isAdmin ? (
              children
            ) : (
              <div aria-busy="true" aria-label="Loading" className="space-y-3">
                <div className="h-8 w-48 rounded bg-line animate-pulse" />
                <div className="grid gap-4 sm:grid-cols-3">
                  {[0, 1, 2].map((i) => <div key={i} className="h-28 rounded-xl bg-line animate-pulse" />)}
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
