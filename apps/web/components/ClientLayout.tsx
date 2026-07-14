'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Sidebar } from './Sidebar';
import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { useAuthStore } from '../lib/store';
import { MODULES, moduleForPath, canAccessModule, isAdmin } from '../lib/modules';

export function ClientLayout({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const { checkAuth, isAuthenticated, token, user } = useAuthStore();
    const [checked, setChecked] = useState(false);
    const [mobileNavOpen, setMobileNavOpen] = useState(false);

    useEffect(() => {
        checkAuth();
        setChecked(true);
    }, []);

    // Cerrar el menú móvil al cambiar de ruta.
    useEffect(() => { setMobileNavOpen(false); }, [pathname]);

    // Bloquear scroll del body cuando el drawer está abierto.
    useEffect(() => {
        document.body.style.overflow = mobileNavOpen ? 'hidden' : '';
        return () => { document.body.style.overflow = ''; };
    }, [mobileNavOpen]);

    useEffect(() => {
        if (checked && !isAuthenticated && pathname !== '/login') {
            router.push('/login');
        }
    }, [checked, isAuthenticated, pathname, router]);

    // Guard por módulo: redirige si el usuario abre algo sin permiso.
    useEffect(() => {
        if (!checked || !isAuthenticated || pathname === '/login') return;
        const firstAllowed = MODULES.find((m) => canAccessModule(user, m.key))?.href;

        // Rutas de administración: solo ADMIN/SUPERADMIN.
        if (pathname.startsWith('/admin')) {
            if (!isAdmin(user) && firstAllowed) router.replace(firstAllowed);
            return;
        }

        const modKey = moduleForPath(pathname);
        if (modKey && !canAccessModule(user, modKey) && firstAllowed) {
            router.replace(firstAllowed);
        }
    }, [checked, isAuthenticated, pathname, user, router]);

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
            {/* Sidebar fijo en desktop */}
            <div className="hidden md:flex">
                <Sidebar />
            </div>

            {/* Drawer móvil */}
            {mobileNavOpen && (
                <div className="fixed inset-0 z-50 md:hidden">
                    <div
                        className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
                        onClick={() => setMobileNavOpen(false)}
                    />
                    <div className="absolute left-0 top-0 h-full w-[260px] bg-[#1a1a1c] shadow-2xl animate-in slide-in-from-left duration-200">
                        <button
                            onClick={() => setMobileNavOpen(false)}
                            className="absolute top-3 right-3 z-10 p-1.5 text-zinc-400 hover:text-white transition-colors"
                            aria-label="Cerrar menú"
                        >
                            <X size={20} />
                        </button>
                        <Sidebar onNavigate={() => setMobileNavOpen(false)} />
                    </div>
                </div>
            )}

            <div className="flex-1 h-full flex flex-col min-w-0 bg-[#fbfbfc] overflow-hidden">
                {/* Barra superior móvil */}
                <header className="md:hidden flex items-center gap-3 h-14 px-4 bg-[#1a1a1c] text-white shrink-0">
                    <button
                        onClick={() => setMobileNavOpen(true)}
                        className="p-1.5 -ml-1.5 text-zinc-300 hover:text-white transition-colors"
                        aria-label="Abrir menú"
                    >
                        <Menu size={22} />
                    </button>
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#FFD84D] to-[#F5A623] shrink-0" />
                        <span className="font-bold tracking-tight">Logistica</span>
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto">
                    <div className="p-4 sm:p-5 md:p-8">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
