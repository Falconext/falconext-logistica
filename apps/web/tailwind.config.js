
const colors = require("tailwindcss/colors");

/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
        "./node_modules/@tremor/**/*.{js,ts,jsx,tsx}", // Added for Tremor
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
                // Tremor Colors (required for v3)
                tremor: {
                    brand: {
                        faint: colors.blue[50],    // #eff6ff
                        muted: colors.blue[200],   // #bfdbfe
                        subtle: colors.blue[400],  // #60a5fa
                        DEFAULT: colors.blue[500], // #3b82f6
                        emphasis: colors.blue[700],// #1d4ed8
                        inverted: colors.white,    // #ffffff
                    },
                    background: {
                        muted: colors.gray[50],    // #f9fafb
                        subtle: colors.gray[100],  // #f3f4f6
                        DEFAULT: colors.white,     // #ffffff
                        emphasis: colors.gray[700],// #374151
                    },
                    border: {
                        DEFAULT: colors.gray[200], // #e5e7eb
                    },
                    ring: {
                        DEFAULT: colors.gray[200], // #e5e7eb
                    },
                    content: {
                        subtle: colors.gray[400],  // #9ca3af
                        DEFAULT: colors.gray[500], // #6b7280
                        emphasis: colors.gray[700],// #374151
                        strong: colors.gray[900],  // #111827
                        inverted: colors.white,    // #ffffff
                    },
                },
                // Dark Mode Tremor (optional mostly handled by class strategy but good to have map)
                "dark-tremor": {
                    brand: {
                        faint: "#0B1229",
                        muted: colors.blue[950],
                        subtle: colors.blue[800],
                        DEFAULT: colors.blue[500],
                        emphasis: colors.blue[400],
                        inverted: colors.blue[950],
                    },
                    background: {
                        muted: "#131A2B",
                        subtle: colors.gray[800],
                        DEFAULT: colors.gray[900],
                        emphasis: colors.gray[300],
                    },
                    border: {
                        DEFAULT: colors.gray[800],
                    },
                    ring: {
                        DEFAULT: colors.gray[800],
                    },
                    content: {
                        subtle: colors.gray[600],
                        DEFAULT: colors.gray[500],
                        emphasis: colors.gray[200],
                        strong: colors.gray[50],
                        inverted: colors.gray[950],
                    },
                },
                // App Colors
                background: "var(--background)",
                foreground: "var(--foreground)",
                primary: {
                    DEFAULT: "#0F172A", // Slate 900
                    foreground: "#F8FAFC",
                },
                accent: {
                    DEFAULT: "#3B82F6", // Blue 500
                    foreground: "#FFFFFF"
                }
            },
            fontFamily: {
                sans: ['var(--font-inter)', 'sans-serif'],
            },
            boxShadow: {
                // light
                "tremor-input": "0 1px 2px 0 rgb(0 0 0 / 0.05)",
                "tremor-card": "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
                "tremor-dropdown": "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
                // dark
                "dark-tremor-input": "0 1px 2px 0 rgb(0 0 0 / 0.05)",
                "dark-tremor-card": "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
                "dark-tremor-dropdown": "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
            },
            borderRadius: {
                "tremor-small": "0.375rem",
                "tremor-default": "0.5rem",
                "tremor-full": "9999px",
            },
            fontSize: {
                "tremor-label": ["0.75rem", { lineHeight: "1rem" }],
                "tremor-default": ["0.875rem", { lineHeight: "1.25rem" }],
                "tremor-title": ["1.125rem", { lineHeight: "1.75rem" }],
                "tremor-metric": ["1.875rem", { lineHeight: "2.25rem" }],
            },
        },
    },
    safelist: [
        {
            pattern:
                /^(bg-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
            variants: ["hover", "ui-selected"],
        },
        {
            pattern:
                /^(text-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
            variants: ["hover", "ui-selected"],
        },
        {
            pattern:
                /^(border-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
            variants: ["hover", "ui-selected"],
        },
        {
            pattern:
                /^(ring-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
        },
        {
            pattern:
                /^(stroke-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
        },
        {
            pattern:
                /^(fill-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-(?:50|100|200|300|400|500|600|700|800|900|950))$/,
        },
    ],
    plugins: [
        // require('@headlessui/tailwindcss')({ prefix: 'ui' })
    ],
};
