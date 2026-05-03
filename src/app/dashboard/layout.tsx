"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import AuthProvider from "@/components/AuthProvider";
import NotificationSetup from "@/components/NotificationSetup";
import {
  LayoutDashboard,
  Megaphone,
  Users,
  MessageSquare,
  Settings,
  LogOut,
  Menu,
  X,
  Target,
  FileText,
} from "lucide-react";
import { useState } from "react";

const navigation = [
  { name: "Dashboard",  href: "/dashboard",                   icon: LayoutDashboard },
  { name: "Campaigns",  href: "/dashboard/campaigns",         icon: Megaphone       },
  { name: "Leads",      href: "/dashboard/leads",             icon: Target          },
  { name: "Contacts",   href: "/dashboard/contacts",          icon: Users           },
  { name: "WhatsApp",   href: "/dashboard/whatsapp",          icon: MessageSquare   },
  { name: "Templates",  href: "/dashboard/whatsapp/templates",icon: FileText        },
  { name: "Settings",   href: "/dashboard/settings",          icon: Settings        },
];

// Bottom tab bar items — most used 5
const bottomNav = [
  { name: "Home",       href: "/dashboard",          icon: LayoutDashboard },
  { name: "Campaigns",  href: "/dashboard/campaigns",icon: Megaphone       },
  { name: "Leads",      href: "/dashboard/leads",    icon: Target          },
  { name: "WhatsApp",   href: "/dashboard/whatsapp", icon: MessageSquare   },
  { name: "Contacts",   href: "/dashboard/contacts", icon: Users           },
];

function DashboardContent({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSignOut = async () => { await signOut(auth); };

  const isActive = (href: string) =>
    href === "/dashboard" ? pathname === href : pathname.startsWith(href);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Top nav ── */}
      <nav className="bg-white shadow-sm border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex justify-between h-14">
            {/* Logo */}
            <div className="flex items-center">
              <Link href="/dashboard" className="text-lg font-bold text-blue-600 mr-6 flex-shrink-0">
                Realhubb
              </Link>
              {/* Desktop nav links */}
              <div className="hidden lg:flex lg:space-x-1">
                {navigation.map((item) => (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
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

            {/* Right side */}
            <div className="flex items-center gap-2">
              {/* Sign out — desktop */}
              <button
                onClick={handleSignOut}
                className="hidden lg:inline-flex items-center px-3 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 rounded-md hover:bg-gray-50"
              >
                <LogOut className="w-4 h-4 mr-1.5" />
                Sign Out
              </button>

              {/* Hamburger — tablet / sm */}
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden p-2 rounded-md text-gray-500 hover:text-gray-900 hover:bg-gray-100"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Slide-down mobile menu (sm–lg) */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-gray-100 bg-white shadow-lg">
            <div className="px-3 py-2 grid grid-cols-2 gap-1">
              {navigation.map((item) => (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={`flex items-center gap-2 px-3 py-2.5 text-sm font-medium rounded-lg ${
                    isActive(item.href)
                      ? "text-blue-600 bg-blue-50"
                      : "text-gray-600 hover:bg-gray-50"
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
        )}
      </nav>

      {/* ── Page content ── */}
      <main className="max-w-7xl mx-auto py-4 sm:py-6 px-3 sm:px-6 lg:px-8 pb-20 sm:pb-6">
        {children}
      </main>

      {/* Push notifications setup — requests permission & shows toasts */}
      <NotificationSetup />

      {/* ── Bottom tab bar — mobile only (< sm = 640px) ── */}
      <div className="sm:hidden fixed bottom-0 inset-x-0 bg-white border-t border-gray-200 z-40">
        <div className="flex">
          {bottomNav.map((item) => {
            const active = isActive(item.href);
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex-1 flex flex-col items-center justify-center py-2 gap-0.5 transition-colors ${
                  active ? "text-blue-600" : "text-gray-400 active:text-gray-600"
                }`}
              >
                <item.icon className={`w-5 h-5 ${active ? "stroke-2" : ""}`} />
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
      <DashboardContent>{children}</DashboardContent>
    </AuthProvider>
  );
}
