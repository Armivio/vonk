import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        warm: ['"Outfit"', "system-ui", "sans-serif"],
        clean: ['"Inter"', "system-ui", "sans-serif"],
      },
      colors: {
        ember: {
          950: "#120c0a",
          900: "#1a1412",
          800: "#2a1f1c",
          700: "#3a2c27",
          600: "#52403a",
        },
        amber: {
          glow: "#f59e0b",
          soft: "#fcd34d",
          deep: "#b45309",
        },
        gemeente: {
          bg: "#fafafa",
          panel: "#ffffff",
          ink: "#0f172a",
          accent: "#1e40af",
          subtle: "#64748b",
        },
      },
      boxShadow: {
        ember: "0 0 30px rgba(245, 158, 11, 0.15)",
      },
    },
  },
  plugins: [],
} satisfies Config;
