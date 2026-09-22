"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import AuthProvider from "@/components/AuthProvider";
import NotificationSetup from "@/components/NotificationSetup";
import { NotificationProvider, useNotifications } from "@/contexts/NotificationContext";
import {
  LayoutDashboard, Megaphone, Users, MessageSquare,
  Settings, LogOut, Menu, X, Target, FileText, BarChart3, Radio, Inbox, ChevronDown,
} from "lucide-react";
import { useState } from "react";

// Grouped into two dropdowns (Meta, WhatsApp) on desktop to cut top-nav
// clutter — each group's own items still render flat in the mobile menu,
// under a small section label, since a narrow screen doesn't have the same
// horizontal-space problem a dropdown solves.
const metaGroup = [
  { name: "Dashboard", href: "/dashboard",           icon: LayoutDashboard },
  { name: "Campaigns", href: "/dashboard/campaigns", icon: Megaphone       },
  { name: "Leads",     href: "/dashboard/leads",     icon: Target          },
];

const whatsappGroup = [
  { name: "Inbox",     href: "/dashboard/whatsapp",           icon: MessageSquare },
  { name: "Templates", href: "/dashboard/whatsapp/templates", icon: FileText      },
  { name: "Dashboard", href: "/dashboard/whatsapp/insights",  icon: BarChart3     },
  { name: "RCS",       href: "/dashboard/rcs",                icon: Radio, badge: "Soon" },
];

const standaloneNav = [
  { name: "Enquiries", href: "/dashboard/enquiries", icon: Inbox    },
  { name: "Contacts",  href: "/dashboard/contacts",  icon: Users    },
  { name: "Settings",  href: "/dashboard/settings",  icon: Settings },
];

const bottomNav = [
  { name: "Home",      href: "/dashboard",          icon: LayoutDashboard },
  { name: "Campaigns", href: "/dashboard/campaigns",icon: Megaphone       },
  { name: "Leads",     href: "/dashboard/leads",    icon: Target          },
  { name: "WhatsApp",  href: "/dashboard/whatsapp", icon: MessageSquare   },
  { name: "Contacts",  href: "/dashboard/contacts", icon: Users           },
];

const WHATSAPP_HREF = "/dashboard/whatsapp";

function DashboardContent({ children }: { children: React.ReactNode }) {
  const pathname                       = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { unreadCount, clearUnread }   = useNotifications();

  const handleSignOut = async () => { await signOut(auth); };

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === href : pathname.startsWith(href);

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

  const waIsActive = isActive(WHATSAPP_HREF);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Top nav ── */}
      <nav className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex justify-between h-14">
            <div className="flex items-center">
              <Link href="/dashboard" className="text-lg font-bold text-blue-600 mr-6 flex-shrink-0">
                Realhubb
              </Link>
              {/* Desktop nav */}
              <div className="hidden lg:flex lg:items-center lg:space-x-1">
                <NavDropdown label="Meta" icon={Megaphone} items={metaGroup} isActive={isActive} />
                <NavDropdown
                  label="WhatsApp" icon={MessageSquare} items={whatsappGroup} isActive={isActive}
                  badge={!waIsActive ? unreadCount : 0}
                />
                {standaloneNav.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`relative inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                      isActive(item.href)
                        ? "text-blue-600 bg-blue-50"
                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                    }`}
                  >
                    <item.icon className="w-4 h-4 mr-1.5" />
                    {item.name}
                  </Link>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleSignOut}
                className="hidden lg:inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 rounded-md hover:bg-gray-50"
              >
                <LogOut className="w-4 h-4 mr-1.5" />
                Sign Out
              </button>
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-2 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile menu — same grouping as the desktop dropdowns, just under
            section labels instead, since a narrow screen doesn't have the
            horizontal-clutter problem a dropdown solves. */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-gray-100 bg-white shadow-lg max-h-[calc(100vh-3.5rem)] overflow-y-auto">
            <div className="px-3 py-2 space-y-3">
              <MobileNavSection label="Meta" items={metaGroup} isActive={isActive} onNavigate={() => setMobileMenuOpen(false)} />
              <MobileNavSection
                label="WhatsApp" items={whatsappGroup} isActive={isActive}
                onNavigate={() => setMobileMenuOpen(false)}
                unreadHref={WHATSAPP_HREF} unreadCount={!waIsActive ? unreadCount : 0}
              />
              <div className="grid grid-cols-2 gap-1 pt-1 border-t border-gray-100">
                {standaloneNav.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-2 px-3 py-2.5 text-sm font-medium rounded-lg ${
                      isActive(item.href) ? "text-blue-600 bg-blue-50" : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    <item.icon className="w-4 h-4 flex-shrink-0" />
                    {item.name}
                  </Link>
                ))}
                <button
                  onClick={handleSignOut}
                  className="flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-lg col-span-2"
                >
                  <LogOut className="w-4 h-4" />
                  Sign Out
                </button>
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Page content */}
      <main className="max-w-7xl mx-auto py-4 sm:py-6 px-3 sm:px-6 lg:px-8 pb-20 sm:pb-6">
        {children}
      </main>

      <NotificationSetup />

      {/* Bottom tab bar — mobile */}
      <div className="sm:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 z-40">
        <div className="flex">
          {bottomNav.map((item) => {
            const active  = isActive(item.href);
            const isWA    = item.href === WHATSAPP_HREF;
            const badge   = isWA && unreadCount > 0 && !active;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`relative flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
                  active ? "text-blue-600" : "text-gray-400 active:text-gray-600"
                }`}
              >
                <item.icon className={`w-5 h-5 ${active ? "stroke-2" : ""}`} />
                {badge && (
                  <span className="absolute top-1 right-[18%] min-w-[16px] h-[16px] px-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                )}
                <span className="text-[10px] font-medium">{item.name}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

function NavDropdown({
  label, icon: Icon, items, isActive, badge,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
  isActive: (href: string) => boolean;
  badge?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const groupActive = items.some((i) => isActive(i.href));

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`relative inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
          groupActive ? "text-blue-600 bg-blue-50" : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
        }`}
      >
        <Icon className="w-4 h-4 mr-1.5" />
        {label}
        <ChevronDown className={`w-3.5 h-3.5 ml-1 transition-transform ${open ? "rotate-180" : ""}`} />
        {!!badge && badge > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute left-0 mt-1 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1 z-40">
          {items.map((item) => (
            <Link
              key={item.name}
              href={item.href}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-2 px-3 py-2 text-sm ${
                isActive(item.href) ? "text-blue-600 bg-blue-50 font-medium" : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              <item.icon className="w-4 h-4" />
              {item.name}
              {item.badge && (
                <span className="ml-auto px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-semibold rounded-full">
                  {item.badge}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function MobileNavSection({
  label, items, isActive, onNavigate, unreadHref, unreadCount,
}: {
  label: string;
  items: NavItem[];
  isActive: (href: string) => boolean;
  onNavigate: () => void;
  unreadHref?: string;
  unreadCount?: number;
}) {
  return (
    <div>
      <p className="px-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <div className="grid grid-cols-2 gap-1">
        {items.map((item) => (
          <Link
            key={item.name}
            href={item.href}
            onClick={onNavigate}
            className={`relative flex items-center gap-2 px-3 py-2.5 text-sm font-medium rounded-lg ${
              isActive(item.href) ? "text-blue-600 bg-blue-50" : "text-gray-600 hover:bg-gray-50"
            }`}
          >
            <item.icon className="w-4 h-4 flex-shrink-0" />
            {item.name}
            {item.badge && (
              <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-semibold rounded-full leading-none">
                {item.badge}
              </span>
            )}
            {item.href === unreadHref && !!unreadCount && unreadCount > 0 && (
              <span className="ml-auto min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <NotificationProvider>
        <DashboardContent>{children}</DashboardContent>
      </NotificationProvider>
    </AuthProvider>
  );
}
