/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: {
          DEFAULT: "var(--surface)",
          muted: "var(--surface-muted)",
          elevated: "var(--surface-elevated)",
          inverse: "var(--surface-inverse)",
        },
        border: {
          DEFAULT: "var(--border)",
          strong: "var(--border-strong)",
        },
        content: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
          inverse: "var(--text-inverse)",
        },
        input: {
          bg: "var(--input-bg)",
          text: "var(--input-text)",
          placeholder: "var(--input-placeholder)",
          border: "var(--input-border)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          hover: "var(--accent-hover)",
        },
        success: "var(--success)",
        warning: "var(--warning)",
        danger: "var(--danger)",
      },
    },
  },
  plugins: [],
};
