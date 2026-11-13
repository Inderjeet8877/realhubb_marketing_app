"use client";

import { createContext, useContext } from "react";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";

export type AlertStatus = "info" | "accent" | "success" | "warning" | "danger";

interface StatusStyle {
  bg: string;
  border: string;
  icon: typeof Info;
  iconColor: string;
  titleColor: string;
}

const STATUS_STYLES: Record<AlertStatus, StatusStyle> = {
  info:    { bg: "bg-blue-50",   border: "border-blue-200",   icon: Info,          iconColor: "text-blue-600",   titleColor: "text-blue-900" },
  accent:  { bg: "bg-indigo-50", border: "border-indigo-200", icon: Info,          iconColor: "text-indigo-600", titleColor: "text-indigo-900" },
  success: { bg: "bg-green-50",  border: "border-green-200",  icon: CheckCircle2,  iconColor: "text-green-600",  titleColor: "text-green-900" },
  warning: { bg: "bg-amber-50",  border: "border-amber-200",  icon: AlertTriangle, iconColor: "text-amber-600",  titleColor: "text-amber-900" },
  danger:  { bg: "bg-red-50",    border: "border-red-200",    icon: XCircle,       iconColor: "text-red-600",    titleColor: "text-red-900" },
};

const AlertStatusContext = createContext<AlertStatus>("info");

interface AlertRootProps {
  status?: AlertStatus;
  children: React.ReactNode;
  className?: string;
  onClose?: () => void;
}

// Local, dependency-free re-implementation of the HeroUI Alert compound API
// (Alert / Alert.Indicator / Alert.Content / Alert.Title / Alert.Description,
// status prop) — HeroUI itself requires React 19 + Tailwind 4, both hard
// incompatible with this app (React 18, Tailwind 3), and installing it would
// reproduce the exact site-wide breakage @mui/material@9 just caused. Same
// visual API, zero external dependency, plain Tailwind.
function AlertRoot({ status = "info", children, className = "", onClose }: AlertRootProps) {
  const style = STATUS_STYLES[status];
  return (
    <AlertStatusContext.Provider value={status}>
      <div className={`flex items-start gap-3 rounded-xl border ${style.bg} ${style.border} p-4 shadow-sm ${className}`}>
        {children}
        {onClose && (
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
    </AlertStatusContext.Provider>
  );
}

function Indicator({ children }: { children?: React.ReactNode }) {
  const status = useContext(AlertStatusContext);
  const style = STATUS_STYLES[status];
  const Icon = style.icon;
  return <div className={`shrink-0 mt-0.5 ${style.iconColor}`}>{children || <Icon className="w-5 h-5" />}</div>;
}

function Content({ children }: { children: React.ReactNode }) {
  return <div className="flex-1 min-w-0">{children}</div>;
}

function Title({ children }: { children: React.ReactNode }) {
  const status = useContext(AlertStatusContext);
  return <p className={`text-sm font-semibold ${STATUS_STYLES[status].titleColor}`}>{children}</p>;
}

function Description({ children }: { children: React.ReactNode }) {
  return <div className="text-sm text-gray-600 mt-0.5">{children}</div>;
}

export const Alert = Object.assign(AlertRoot, { Indicator, Content, Title, Description });
