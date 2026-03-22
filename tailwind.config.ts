import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        accent: {
          DEFAULT: "#0F6FDE",
          dark: "#0A4F9E",
          light: "#EBF4FF",
        },
        green: {
          DEFAULT: "#16A34A",
          light: "#F0FDF4",
          text: "#15803D",
        },
        amber: {
          DEFAULT: "#D97706",
          light: "#FFFBEB",
          text: "#B45309",
        },
        red: {
          DEFAULT: "#DC2626",
          light: "#FEF2F2",
          text: "#B91C1C",
        },
        purple: {
          DEFAULT: "#7C3AED",
          light: "#F5F3FF",
        },
        page: "#FAFAFA",
        card: "#FFFFFF",
        sidebar: "#FFFFFF",
        subtle: "#E5E7EB",
        "border-light": "#F3F4F6",
        hover: "#F5F5F5",
        context: "#F7F7F5",
        subtotal: "#F5F5F5",
        "text-primary": "#111827",
        "text-secondary": "#6B7280",
        "text-tertiary": "#9CA3AF",
        "text-disabled": "#D1D5DB",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
