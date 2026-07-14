'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { useEffect, useState } from 'react';
import { useAuthStore } from '../lib/store';

export function ClientLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const { checkAuth, isAuthenticated, token } = useAuthStore();
    const [checked, setChecked] = useState(false);

    useEffect(() => {
        checkAuth();
        setChecked(true);
    }, []);

    useEffect(() => {
        if (checked && !isAuthenticated && pathname !== '/login') {
            router.push('/login');
        }
    }, [checked, isAuthenticated, pathname, router]);

    const isLoginPage = pathname === '/login';

    if (!checked) return null; // Or a loading spinner

    if (isLoginPage) {
        return (
            <div className="min-h-screen w-full bg-white text-slate-900">
                {children}
            </div>
        );
    }

    return (
        <div className="flex h-screen bg-[#1a1a1c] text-slate-900 overflow-hidden">
            <div className="hidden md:flex">
                <Sidebar />
            </div>
            <main className="flex-1 h-full bg-[#fbfbfc] overflow-y-auto">
                <div className="p-5 md:p-8">
                    {children}
                </div>
            </main>
        </div>
    );
}
