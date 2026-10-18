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
      <div className="min-h-screen bg-[#F4F7FB] lg:flex">
        <aside className="hidden lg:flex lg:flex-col w-60 shrink-0 bg-[#0F1A38] text-white sticky top-0 h-screen">
          <div className="px-5 h-16 flex items-center bg-white">
            <Link href="/admin" className="rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
              <Image src="/brand/logo_light.png" alt="Broadzen" width={141} height={30} priority className="h-[30px] w-auto" />
            </Link>
          </div>
          <div className="h-1 bg-gradient-to-r from-[#00F5E9] to-[#00C471]" aria-hidden />
          <nav aria-label="Admin" className="p-3 space-y-1">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={active(n.href) ? "page" : undefined}
                className={`flex items-center gap-3 min-h-[44px] px-3 rounded-lg text-sm font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00F5E9] ${
                  active(n.href) ? "bg-white/10 text-[#00F5E9]" : "text-white/80 hover:bg-white/5 hover:text-white"
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
          <header className="bg-white border-b border-gray-200">
            <div className="h-16 px-4 sm:px-6 flex items-center justify-between gap-3">
              <Link href="/admin" className="lg:hidden">
                <Image src="/brand/logo_light.png" alt="Broadzen" width={113} height={24} className="h-6 w-auto" />
              </Link>
              <span className="hidden lg:block text-sm font-semibold text-[#0F1A38]">Admin panel</span>
              <div className="flex items-center gap-3">
                {me && <span className="hidden sm:block text-sm text-gray-600 truncate max-w-[220px]">{me.user.email}</span>}
                <button className={btn.secondary} onClick={() => signOut()}>
                  <LogOut className="w-4 h-4" aria-hidden /> Sign out
                </button>
              </div>
            </div>
            <nav aria-label="Admin" className="lg:hidden flex overflow-x-auto px-2 border-t border-gray-100">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active(n.href) ? "page" : undefined}
                  className={`min-h-[44px] px-3 flex items-center text-sm font-medium whitespace-nowrap border-b-2 ${
                    active(n.href) ? "border-teal-700 text-teal-800" : "border-transparent text-gray-600"
                  }`}
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </header>

          <main className="p-4 sm:p-6 max-w-6xl">
            {error && !me ? (
              <p role="alert" className="p-4 rounded-lg border border-red-200 bg-red-50 text-sm text-red-800">{error.message}</p>
            ) : isAdmin ? (
              children
            ) : (
              <div aria-busy="true" aria-label="Loading" className="space-y-3">
                <div className="h-8 w-48 rounded bg-gray-200 animate-pulse" />
                <div className="grid gap-4 sm:grid-cols-3">
                  {[0, 1, 2].map((i) => <div key={i} className="h-28 rounded-xl bg-gray-200/70 animate-pulse" />)}
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </ToastProvider>
  );
}
