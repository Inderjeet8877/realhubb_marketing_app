"use client";

import { useState, type ReactNode } from "react";

// Renders only the rows currently in view (plus a few above/below), so a list
// of tens of thousands of items scrolls as smoothly as a list of twenty.
// Every row must have the same fixed height (`rowHeight`, px).
export default function WindowedList<T>({
  items,
  rowHeight,
  maxHeight,
  getKey,
  renderRow,
  overscan = 6,
  className = "",
}: {
  items: T[];
  rowHeight: number;
  maxHeight: number;
  getKey: (item: T, index: number) => string | number;
  renderRow: (item: T, index: number) => ReactNode;
  overscan?: number;
  className?: string;
}) {
  const [scrollTop, setScrollTop] = useState(0);
  const total = items.length * rowHeight;
  const height = Math.min(maxHeight, total);
  const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
  const end = Math.min(items.length, Math.ceil((scrollTop + height) / rowHeight) + overscan);

  return (
    <div
      className={`overflow-y-auto ${className}`}
      style={{ height }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: total, position: "relative" }}>
        <div style={{ position: "absolute", top: start * rowHeight, left: 0, right: 0 }}>
          {items.slice(start, end).map((item, i) => (
            <div key={getKey(item, start + i)} style={{ height: rowHeight }}>
              {renderRow(item, start + i)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
