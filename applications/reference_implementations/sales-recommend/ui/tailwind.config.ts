import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Deep dark blues / slates for surfaces
        ink: {
          950: "#070b14",
          900: "#0b1120",
          850: "#0f172a",
          800: "#13203b",
          750: "#1a2949",
          700: "#1e293b",
          600: "#334155",
        },
        // Sharp accents
        accent: {
          DEFAULT: "#10b981", // emerald
          soft: "#34d399",
          deep: "#059669",
        },
        electric: {
          DEFAULT: "#3b82f6", // vibrant blue
          soft: "#60a5fa",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(16,185,129,0.25), 0 8px 30px -8px rgba(16,185,129,0.35)",
        card: "0 10px 40px -12px rgba(2,6,23,0.55)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-dot": {
          "0%, 100%": { opacity: "0.3", transform: "scale(0.8)" },
          "50%": { opacity: "1", transform: "scale(1)" },
        },
        "grow-bar": {
          "0%": { transform: "scaleY(0)" },
          "100%": { transform: "scaleY(1)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.4s ease-out both",
        "pulse-dot": "pulse-dot 1.2s ease-in-out infinite",
        "grow-bar": "grow-bar 0.8s cubic-bezier(0.16,1,0.3,1) both",
      },
    },
  },
  plugins: [],
};

export default config;
