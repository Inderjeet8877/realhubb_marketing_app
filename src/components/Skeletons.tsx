"use client";

import Skeleton, { SkeletonTheme } from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";

// Matches this app's neutral gray palette (bg-gray-50 pages, bg-white cards,
// border-gray-100/200) so skeletons sit naturally instead of looking like a
// generic default gray box.
export function AppSkeletonTheme({ children }: { children: React.ReactNode }) {
  return (
    <SkeletonTheme baseColor="#e5e7eb" highlightColor="#f3f4f6">
      {children}
    </SkeletonTheme>
  );
}

export function StatCardsSkeleton({ count = 3 }: { count?: number }) {
  return (
    <AppSkeletonTheme>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <Skeleton circle width={36} height={36} />
            <div className="mt-3">
              <Skeleton width={70} height={12} />
              <Skeleton width={90} height={22} style={{ marginTop: 6 }} />
            </div>
          </div>
        ))}
      </div>
    </AppSkeletonTheme>
  );
}

export function TableSkeleton({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <AppSkeletonTheme>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <Skeleton width={160} height={16} />
        </div>
        <div className="divide-y divide-gray-50">
          {Array.from({ length: rows }).map((_, r) => (
            <div key={r} className="flex items-center gap-4 px-4 py-3.5">
              {Array.from({ length: cols }).map((_, c) => (
                <div key={c} className="flex-1 min-w-0">
                  <Skeleton width={c === 0 ? "70%" : "50%"} height={14} />
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </AppSkeletonTheme>
  );
}

export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <AppSkeletonTheme>
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 bg-white rounded-xl border border-gray-100 p-3.5">
            <Skeleton circle width={40} height={40} />
            <div className="flex-1 min-w-0">
              <Skeleton width="40%" height={14} />
              <Skeleton width="65%" height={12} style={{ marginTop: 6 }} />
            </div>
            <Skeleton width={60} height={22} borderRadius={999} />
          </div>
        ))}
      </div>
    </AppSkeletonTheme>
  );
}

export function CardGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <AppSkeletonTheme>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 space-y-3">
            <div className="flex items-center justify-between">
              <Skeleton width="55%" height={16} />
              <Skeleton width={50} height={18} borderRadius={999} />
            </div>
            <Skeleton count={2} height={12} />
            <Skeleton width="30%" height={12} />
          </div>
        ))}
      </div>
    </AppSkeletonTheme>
  );
}

export function ChatListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <AppSkeletonTheme>
      <div className="divide-y divide-gray-50">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <Skeleton circle width={44} height={44} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <Skeleton width="45%" height={13} />
                <Skeleton width={36} height={10} />
              </div>
              <Skeleton width="70%" height={12} style={{ marginTop: 6 }} />
            </div>
          </div>
        ))}
      </div>
    </AppSkeletonTheme>
  );
}

export function ChatBubblesSkeleton() {
  const widths = ["55%", "70%", "40%", "60%", "45%"];
  return (
    <AppSkeletonTheme>
      <div className="space-y-3 py-2">
        {widths.map((w, i) => (
          <div key={i} className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}>
            <div className="bg-white/70 rounded-xl px-3 py-2" style={{ width: w }}>
              <Skeleton height={12} />
            </div>
          </div>
        ))}
      </div>
    </AppSkeletonTheme>
  );
}

export function FormSkeleton({ fields = 5 }: { fields?: number }) {
  return (
    <AppSkeletonTheme>
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-5">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i}>
            <Skeleton width={110} height={12} style={{ marginBottom: 6 }} />
            <Skeleton height={38} borderRadius={8} />
          </div>
        ))}
      </div>
    </AppSkeletonTheme>
  );
}
