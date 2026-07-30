import type { Config } from "tailwindcss";

/**
 * The real Sakn design system (capProject/13_Design_Tokens.md) is plain CSS
 * custom properties + literal inline styles, not a Tailwind theme — see
 * globals.css's `:root` block. This file intentionally carries no invented
 * color/shadow/font theme; Tailwind is kept only for layout utilities
 * (flex/grid/spacing) that converted screens may still reach for.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-ibm-plex-arabic)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
