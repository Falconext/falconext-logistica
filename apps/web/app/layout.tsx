
import type { Metadata } from "next";
import { Space_Grotesk, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Sidebar } from "../components/Sidebar";
import { ClientLayout } from "../components/ClientLayout";

import { Providers } from "../components/Providers";

// Mismo sistema tipográfico que reparto-platform:
// Space Grotesk (títulos) · Inter (cuerpo) · JetBrains Mono (números).
const display = Space_Grotesk({ subsets: ["latin"], variable: "--font-display", weight: ["500", "600", "700"] });
const body = Inter({ subsets: ["latin"], variable: "--font-body" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["400", "500", "600"] });

export const metadata: Metadata = {
    title: "Logistica Premium",
    description: "Sistema de gestión de transporte y personal",
};

import { Toaster } from 'sonner';

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="es" suppressHydrationWarning>
            <body className={`${display.variable} ${body.variable} ${mono.variable}`}>
                <Providers>
                    <ClientLayout>
                        {children}
                        <Toaster richColors position="top-center" closeButton />
                    </ClientLayout>
                </Providers>
            </body>
        </html>
    );
}
