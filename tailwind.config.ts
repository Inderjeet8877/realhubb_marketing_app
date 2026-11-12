import type { Config } from "tailwindcss";

// Signal Room tokens. Colours are CSS variables (globals.css) so surfaces can
// theme light/dark; `signal` is the brand gradient, used only for live state.
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/components/**/*.{ts,tsx}", "./src/app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: "#0F1A38", 2: "#16234A", 3: "#1E2E5C", line: "#2A3A6B" },
        signal: { cyan: "#00F5E9", mint: "#00C471", soft: "#2DD4BF" },
        bg: v("bg"),
        surface: v("surface"),
        line: v("line"),
        fg: v("fg"),
        muted: v("muted"),
        accent: v("accent"),
        "on-accent": v("on-accent"),
        primary: v("primary"),
        "on-primary": v("on-primary"),
        warn: v("warn"),
        danger: v("danger"),
        ok: v("ok"),
      },
      fontFamily: {
        display: ["var(--font-sora)", "system-ui", "sans-serif"],
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      backgroundImage: {
        signal: "linear-gradient(100deg, #00F5E9, #00C471)",
      },
      transitionTimingFunction: {
        out: "cubic-bezier(.23,1,.32,1)",
        "in-out": "cubic-bezier(.65,0,.35,1)",
      },
      transitionDuration: { fast: "120ms", base: "200ms", slow: "320ms" },
    },
  },
  plugins: [],
};
export default config;
