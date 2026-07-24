"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import AuthProvider from "@/components/AuthProvider";
import NotificationSetup from "@/components/NotificationSetup";
import { NotificationProvider, useNotifications } from "@/contexts/NotificationContext";
import {
  LayoutDashboard, Megaphone, Users, MessageSquare,
  Settings, LogOut, Menu, X, Target, FileText, BarChart3,
} from "lucide-react";
import { useState } from "react";

const navigation = [
  { name: "Dashboard",  href: "/dashboard",                    icon: LayoutDashboard },
  { name: "Campaigns",  href: "/dashboard/campaigns",          icon: Megaphone       },
  { name: "Leads",      href: "/dashboard/leads",              icon: Target          },
  { name: "Contacts",   href: "/dashboard/contacts",           icon: Users           },
  { name: "WhatsApp",   href: "/dashboard/whatsapp",           icon: MessageSquare   },
  { name: "Templates",  href: "/dashboard/whatsapp/templates", icon: FileText        },
  { name: "Insights",   href: "/dashboard/whatsapp/insights",  icon: BarChart3       },
  { name: "Settings",   href: "/dashboard/settings",           icon: Settings        },
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
              <div className="hidden lg:flex lg:space-x-1">
                {navigation.map((item) => {
                  const isWA  = item.href === WHATSAPP_HREF;
                  const badge = isWA && unreadCount > 0 && !waIsActive;
                  return (
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
                      {badge && (
                        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                          {unreadCount > 99 ? "99+" : unreadCount}
                        </span>
                      )}
                    </Link>
                  );
                })}
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

        {/* Mobile menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-gray-100 bg-white shadow-lg">
            <div className="px-3 py-2 grid grid-cols-2 gap-1">
              {navigation.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`relative flex items-center gap-2 px-3 py-2.5 text-sm font-medium rounded-lg ${
                    isActive(item.href) ? "text-blue-600 bg-blue-50" : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <item.icon className="w-4 h-4 flex-shrink-0" />
                  {item.name}
                  {item.href === WHATSAPP_HREF && unreadCount > 0 && !waIsActive && (
                    <span className="ml-auto min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {unreadCount > 99 ? "99+" : unreadCount}
                    </span>
                  )}
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

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <NotificationProvider>
        <DashboardContent>{children}</DashboardContent>
      </NotificationProvider>
    </AuthProvider>
  );
}
