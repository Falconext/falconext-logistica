
import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import "./globals.css";
import { Sidebar } from "../components/Sidebar";
import { ClientLayout } from "../components/ClientLayout";

import { Providers } from "../components/Providers";

const poppins = Poppins({ subsets: ["latin"], weight: ['400', '500', '600', '700', '800'], variable: '--font-sans' });

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
            <body className={poppins.variable}>
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
