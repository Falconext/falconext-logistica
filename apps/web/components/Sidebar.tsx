
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, Truck, Settings, Moon, Sun, Map } from 'lucide-react';
import clsx from 'clsx';
import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

const menuItems = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Operaciones', href: '/operaciones', icon: Map },
    { name: 'Trabajadores', href: '/trabajadores', icon: Users },
    { name: 'Vehículos', href: '/vehiculos', icon: Truck },
];

export function Sidebar() {
    const pathname = usePathname();
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => setMounted(true), []);

    return (
        <aside className="fixed inset-y-0 left-0 z-50 w-64 bg-white/80 dark:bg-[#020617]/80 border-r border-slate-200 dark:border-slate-800/60 backdrop-blur-xl text-slate-900 dark:text-white transition-all duration-300 ease-in-out hidden md:flex flex-col">
            <div className="flex h-24 items-center px-6 border-b border-slate-200 dark:border-slate-800/60">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-blue-400 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20">
                        <Truck className="text-white" size={20} />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold tracking-tight text-slate-900 dark:text-white leading-none">Logistica</h1>
                        <span className="text-xs text-slate-500 font-medium tracking-wide">PREMIUM</span>
                    </div>
                </div>
            </div>

            <nav className="flex-1 space-y-1 p-4 mt-2">
                {menuItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = pathname === item.href;
                    return (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={clsx(
                                'flex items-center gap-3 rounded-xl px-4 py-3.5 text-sm font-medium transition-all duration-300 group',
                                isActive
                                    ? 'bg-blue-50 dark:bg-blue-600/10 text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-600/20'
                                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/40 hover:text-slate-900 dark:hover:text-slate-200 border border-transparent'
                            )}
                        >
                            <Icon size={20} className={clsx("transition-colors", isActive ? 'text-blue-600 dark:text-blue-400' : 'text-slate-500 group-hover:text-slate-400 dark:group-hover:text-slate-300')} />
                            {item.name}
                        </Link>
                    );
                })}
            </nav>

            <div className="border-t border-slate-200 dark:border-slate-800 p-4 space-y-2">
                <button
                    onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                    className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/40 transition-colors"
                >
                    {mounted && theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
                    {mounted && theme === 'dark' ? 'Modo Claro' : 'Modo Oscuro'}
                </button>
                <button className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/40 transition-colors">
                    <Settings size={20} />
                    Configuración
                </button>
            </div>
        </aside>
    );
}
