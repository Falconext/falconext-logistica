const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    transpilePackages: ["ui"],
    // Fija la raíz del monorepo para que Turbopack no infiera un lockfile ajeno del home
    turbopack: {
        root: path.join(__dirname, "..", ".."),
    },
};

module.exports = nextConfig;
