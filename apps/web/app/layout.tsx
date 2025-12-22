
import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import { Sidebar } from "../components/Sidebar";

import { Providers } from "../components/Providers";

const outfit = Outfit({ subsets: ["latin"], variable: '--font-outfit' });

export const metadata: Metadata = {
    title: "Logistica Premium",
    description: "Sistema de gestión de transporte y personal",
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="es" suppressHydrationWarning>
            <body className={outfit.variable}>
                <Providers>
                    <div className="flex min-h-screen bg-slate-50 dark:bg-[#020617] text-slate-900 dark:text-slate-200 transition-colors duration-300">
                        <Sidebar />
                        <main className="flex-1 md:ml-64 p-8 transition-all duration-300">
                            {children}
                        </main>
                    </div>
                </Providers>
            </body>
        </html>
    );
}
