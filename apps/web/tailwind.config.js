
/** @type {import('tailwindcss').Config} */
module.exports = {
    content: [
        "./app/**/*.{js,ts,jsx,tsx,mdx}",
        "./components/**/*.{js,ts,jsx,tsx,mdx}",
    ],
    darkMode: 'class',
    theme: {
        extend: {
            colors: {
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
            }
        },
    },
    plugins: [],
};
