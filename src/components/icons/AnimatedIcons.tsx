"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Copy, Check, Trash2, Send, ChevronDown } from "lucide-react";

interface IconProps {
  className?: string;
}

// Copy icon that morphs into a checkmark once copied — className drives both
// size and color so it matches whatever button it's dropped into (no fixed
// colors baked in here).
export function AnimatedCopyIcon({ copied, className = "w-4 h-4" }: IconProps & { copied: boolean }) {
  return (
    <span className={`relative inline-flex ${className}`}>
      <AnimatePresence mode="wait" initial={false}>
        {copied ? (
          <motion.span
            key="check"
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.4, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <Check className={className} />
          </motion.span>
        ) : (
          <motion.span
            key="copy"
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.4, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <Copy className={className} />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

// Trash icon that gives a small shake on hover — purely decorative feedback,
// no state needed.
export function AnimatedDeleteIcon({ className = "w-4 h-4" }: IconProps) {
  return (
    <motion.span
      className={`inline-flex ${className}`}
      whileHover={{ rotate: [0, -12, 10, -6, 0] }}
      transition={{ duration: 0.4 }}
    >
      <Trash2 className={className} />
    </motion.span>
  );
}

// Send icon that launches up-and-away while `sending` is true, otherwise a
// small nudge on hover.
export function AnimatedSendIcon({ sending = false, className = "w-4 h-4" }: IconProps & { sending?: boolean }) {
  return (
    <motion.span
      className={`inline-flex ${className}`}
      animate={sending ? { x: [0, 16, 0], y: [0, -16, 0], opacity: [1, 0, 1] } : { x: 0, y: 0 }}
      whileHover={!sending ? { x: 2, y: -2 } : undefined}
      transition={sending ? { duration: 0.5, ease: "easeInOut" } : { duration: 0.15 }}
    >
      <Send className={className} />
    </motion.span>
  );
}

// Chevron that rotates smoothly based on open/expanded state, replacing a
// plain CSS `rotate-180` class swap with an actual animated transition.
export function AnimatedChevronDown({ open, className = "w-4 h-4" }: IconProps & { open: boolean }) {
  return (
    <motion.span
      className={`inline-flex ${className}`}
      animate={{ rotate: open ? 180 : 0 }}
      transition={{ duration: 0.2, ease: "easeInOut" }}
    >
      <ChevronDown className={className} />
    </motion.span>
  );
}
