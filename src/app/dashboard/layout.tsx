"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import AuthProvider from "@/components/AuthProvider";
import NotificationSetup from "@/components/NotificationSetup";
import { NotificationProvider, useNotifications } from "@/contexts/NotificationContext";
import { ToastProvider } from "@/contexts/ToastContext";
import { ConfirmProvider } from "@/contexts/ConfirmContext";
import {
  LayoutDashboard, Megaphone, Users, MessageSquare,
  Settings, LogOut, Menu, X, Target, FileText, Radio, Inbox,
  PanelLeftClose, PanelLeftOpen,
} from "lucide-react";

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

interface NavSection {
  label?: string;
  items: NavItem[];
}

// Grouped the way the team works: overview, the Meta ads side, the
// WhatsApp side, then the people (contacts + website enquiries).
const navSections: NavSection[] = [
  { items: [{ name: "Dashboard", href: "/dashboard", icon: LayoutDashboard }] },
  {
    label: "Meta Ads",
    items: [
      { name: "Campaigns", href: "/dashboard/campaigns", icon: Megaphone },
      { name: "Leads",     href: "/dashboard/leads",     icon: Target    },
    ],
  },
  {
    label: "WhatsApp",
    items: [
      { name: "Messages",  href: "/dashboard/whatsapp",           icon: MessageSquare },
      { name: "Templates", href: "/dashboard/whatsapp/templates", icon: FileText      },
      { name: "RCS",       href: "/dashboard/rcs",                icon: Radio, badge: "Soon" },
    ],
  },
  {
    label: "Audience",
    items: [
      { name: "Contacts",  href: "/dashboard/contacts",  icon: Users },
      { name: "Enquiries", href: "/dashboard/enquiries", icon: Inbox },
    ],
  },
];

const settingsItem: NavItem = { name: "Settings", href: "/dashboard/settings", icon: Settings };

const bottomNav: NavItem[] = [
  { name: "Home",      href: "/dashboard",          icon: LayoutDashboard },
  { name: "Campaigns", href: "/dashboard/campaigns",icon: Megaphone       },
  { name: "Leads",     href: "/dashboard/leads",    icon: Target          },
  { name: "WhatsApp",  href: "/dashboard/whatsapp", icon: MessageSquare   },
  { name: "Contacts",  href: "/dashboard/contacts", icon: Users           },
];

const WHATSAPP_HREF = "/dashboard/whatsapp";
const COLLAPSE_KEY = "rh.sidebarCollapsed";

const allNavItems = [...navSections.flatMap((s) => s.items), settingsItem];

function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5 min-w-0">
      <span className="grid place-items-center w-8 h-8 shrink-0 rounded-lg bg-blue-600 text-white text-[15px] font-bold shadow-sm">
        R
      </span>
      {!compact && <span className="text-[17px] font-bold tracking-tight text-gray-900 truncate">Realhubb</span>}
    </span>
  );
}

function DashboardContent({ children }: { children: React.ReactNode }) {
  const pathname                     = usePathname();
  const [drawerOpen, setDrawerOpen]  = useState(false);
  const [collapsed, setCollapsed]    = useState(false);
  const { unreadCount, clearUnread } = useNotifications();

  const handleSignOut = async () => { await signOut(auth); };

  // "Inbox" (/dashboard/whatsapp) must not light up while on its
  // Templates child page, so the most specific matching href wins.
  const activeHref = allNavItems
    .map((i) => i.href)
    .filter((href) => (href === "/dashboard" ? pathname === href : pathname === href || pathname.startsWith(href + "/")))
    .sort((a, b) => b.length - a.length)[0];
  const isActive = (href: string) => href === activeHref;
  const currentTitle = allNavItems.find((i) => i.href === activeHref)?.name ?? "Realhubb";

  useEffect(() => {
    try { setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1"); } catch { /* storage unavailable */ }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      try { localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1"); } catch { /* storage unavailable */ }
      return !c;
    });
  };

  // Close the mobile drawer whenever the route changes.
  useEffect(() => { setDrawerOpen(false); }, [pathname]);

  // Escape closes the drawer.
  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setDrawerOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  // Clear unread badge when user is on the WhatsApp page
  useEffect(() => {
    if (pathname.startsWith(WHATSAPP_HREF)) clearUnread();
  }, [pathname, clearUnread]);

  // Show unread count in browser tab title
  useEffect(() => {
    const base = "Realhubb";
    document.title = unreadCount > 0 ? `(${unreadCount}) ${base}` : base;
    return () => { document.title = base; };
  }, [unreadCount]);

  const unreadBadge = pathname.startsWith(WHATSAPP_HREF) ? 0 : unreadCount;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Desktop sidebar ── */}
      <aside
        className={`hidden lg:flex fixed inset-y-0 left-0 z-30 flex-col bg-white border-r border-gray-200 transition-[width] duration-200 ease-out ${
          collapsed ? "w-[var(--sidebar-w-collapsed)]" : "w-[var(--sidebar-w)]"
        }`}
      >
        <div className={`flex items-center h-16 shrink-0 border-b border-gray-100 ${collapsed ? "justify-center px-2" : "px-5"}`}>
          <Link href="/dashboard" aria-label="Realhubb home"><BrandMark compact={collapsed} /></Link>
        </div>
        <SidebarNav
          collapsed={collapsed}
          isActive={isActive}
          unreadCount={unreadBadge}
          onSignOut={handleSignOut}
          footer={
            <button
              onClick={toggleCollapsed}
              className={`flex items-center gap-3 w-full h-9 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors ${collapsed ? "justify-center" : "px-3"}`}
              aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              title={collapsed ? "Expand sidebar" : undefined}
            >
              {collapsed ? <PanelLeftOpen className="w-[18px] h-[18px]" /> : <PanelLeftClose className="w-[18px] h-[18px]" />}
              {!collapsed && "Collapse"}
            </button>
          }
        />
      </aside>

      {/* ── Mobile / tablet top bar ── */}
      <header className="lg:hidden sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-gray-200 pt-safe">
        <div className="flex items-center gap-2 h-14 px-2 sm:px-4">
          <button
            onClick={() => setDrawerOpen(true)}
            className="grid place-items-center w-10 h-10 rounded-lg text-gray-600 hover:bg-gray-100"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5" />
          </button>
          <Link href="/dashboard" aria-label="Realhubb home" className="shrink-0"><BrandMark compact /></Link>
          <span className="ml-1 text-[15px] font-semibold text-gray-900 truncate">{currentTitle}</span>
        </div>
      </header>

      {/* ── Mobile / tablet drawer ── */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-gray-900/40 animate-fade-in" onClick={() => setDrawerOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-[17rem] max-w-[85vw] bg-white shadow-xl flex flex-col animate-drawer-in pt-safe">
            <div className="flex items-center justify-between h-14 px-4 border-b border-gray-100 shrink-0">
              <BrandMark />
              <button
                onClick={() => setDrawerOpen(false)}
                className="grid place-items-center w-9 h-9 rounded-lg text-gray-500 hover:bg-gray-100"
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <SidebarNav collapsed={false} isActive={isActive} unreadCount={unreadBadge} onSignOut={handleSignOut} />
          </div>
        </div>
      )}

      {/* ── Page content ── */}
      <div className={`transition-[padding] duration-200 ease-out ${collapsed ? "lg:pl-[var(--sidebar-w-collapsed)]" : "lg:pl-[var(--sidebar-w)]"}`}>
        <main className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8 pt-5 sm:pt-7 pb-24 sm:pb-10">
          {children}
        </main>
      </div>

      <NotificationSetup />

      {/* ── Bottom tab bar — phones ── */}
      <nav className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-gray-200 pb-safe" aria-label="Primary">
        <div className="flex">
          {bottomNav.map((item) => {
            const active = isActive(item.href) || (item.href === WHATSAPP_HREF && pathname.startsWith(WHATSAPP_HREF));
            const badge  = item.href === WHATSAPP_HREF && unreadBadge > 0;
            return (
              <Link
                key={item.name}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`relative flex-1 flex flex-col items-center justify-center pt-2 pb-1.5 gap-1 transition-colors ${
                  active ? "text-blue-600" : "text-gray-500 active:text-gray-700"
                }`}
              >
                <span className={`absolute top-0 h-0.5 w-8 rounded-full ${active ? "bg-blue-600" : "bg-transparent"}`} />
                <item.icon className="w-5 h-5" />
                {badge && (
                  <span className="absolute top-1 left-1/2 ml-1.5 min-w-[16px] h-4 px-1 bg-red-500 text-white text-[10px] font-semibold rounded-full grid place-items-center tabular-nums">
                    {unreadBadge > 9 ? "9+" : unreadBadge}
                  </span>
                )}
                <span className={`text-[11px] ${active ? "font-semibold" : "font-medium"}`}>{item.name}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

function SidebarNav({
  collapsed, isActive, unreadCount, onSignOut, footer,
}: {
  collapsed: boolean;
  isActive: (href: string) => boolean;
  unreadCount: number;
  onSignOut: () => void;
  footer?: React.ReactNode;
}) {
  return (
    <>
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5" aria-label="Main">
        {navSections.map((section, i) => (
          <div key={section.label ?? i}>
            {section.label && (
              collapsed
                ? <div className="mx-auto mb-2 h-px w-6 bg-gray-200" aria-hidden />
                : <p className="px-3 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-400">{section.label}</p>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.href}>
                  <SidebarLink
                    item={item}
                    active={isActive(item.href)}
                    collapsed={collapsed}
                    count={item.href === WHATSAPP_HREF ? unreadCount : 0}
                  />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="shrink-0 border-t border-gray-100 px-3 py-3 space-y-0.5 pb-safe">
        <SidebarLink item={settingsItem} active={isActive(settingsItem.href)} collapsed={collapsed} count={0} />
        <button
          onClick={onSignOut}
          className={`flex items-center gap-3 w-full h-9 rounded-lg text-sm font-medium text-gray-600 hover:bg-red-50 hover:text-red-700 transition-colors ${collapsed ? "justify-center" : "px-3"}`}
          title={collapsed ? "Sign out" : undefined}
        >
          <LogOut className="w-[18px] h-[18px] shrink-0" />
          {!collapsed && "Sign out"}
        </button>
        {footer}
      </div>
    </>
  );
}

function SidebarLink({
  item, active, collapsed, count,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
  count: number;
}) {
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.name : undefined}
      className={`relative flex items-center gap-3 h-9 rounded-lg text-sm font-medium transition-colors ${
        collapsed ? "justify-center" : "px-3"
      } ${active ? "bg-blue-50 text-blue-700" : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"}`}
    >
      <item.icon className={`w-[18px] h-[18px] shrink-0 ${active ? "text-blue-600" : "text-gray-400"}`} />
      {!collapsed && <span className="truncate">{item.name}</span>}
      {!collapsed && item.badge && <span className="ml-auto badge badge-amber">{item.badge}</span>}
      {count > 0 && (
        collapsed
          ? <span className="absolute top-1 right-1.5 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white" aria-label={`${count} unread`} />
          : <span className="ml-auto min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-semibold grid place-items-center tabular-nums">
              {count > 99 ? "99+" : count}
            </span>
      )}
    </Link>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ToastProvider>
        <ConfirmProvider>
          <NotificationProvider>
            <DashboardContent>{children}</DashboardContent>
          </NotificationProvider>
        </ConfirmProvider>
      </ToastProvider>
    </AuthProvider>
  );
}
