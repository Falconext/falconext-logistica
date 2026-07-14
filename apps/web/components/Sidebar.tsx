'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, Users, Truck, Map, Wrench, ShieldCheck, LogOut, Bell, CalendarDays, BarChart3, FileSpreadsheet, MessageSquare, PlayCircle, HelpCircle, Briefcase, ChevronsLeft, Receipt, Fuel, UserCog, KeyRound, Radio, Sun, Moon } from 'lucide-react';
import clsx from 'clsx';
import { useEffect, useState } from 'react';
import { useTheme } from 'next-themes';
import { useAuthStore } from '../lib/store';
import { canAccessModule, isAdmin as isAdminUser } from '../lib/modules';

const primaryItems = [
    { key: 'dashboard', name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { key: 'operaciones', name: 'Operaciones', href: '/operaciones', icon: Map },
    { key: 'trabajadores', name: 'Trabajadores', href: '/trabajadores', icon: Users },
    { key: 'vehiculos', name: 'Vehículos', href: '/vehiculos', icon: Truck },
    { key: 'mantenimiento', name: 'Mantenimiento', href: '/mantenimiento', icon: Wrench },
    { key: 'peajes', name: 'Peajes/Multas', href: '/peajes', icon: Receipt },
    { key: 'combustible', name: 'Combustible', href: '/combustible', icon: Fuel },
    { key: 'calendario', name: 'Calendario', href: '/calendario', icon: CalendarDays },
    { key: 'reportes', name: 'Reportes', href: '/reportes', icon: BarChart3 },
];

const trackingItems = [
    { key: 'flota', name: 'Flota en Vivo', href: '/flota', icon: Radio },
    { key: 'alertas', name: 'Alertas', href: '/alertas', icon: Bell },
    { key: 'dispositivos', name: 'Dispositivos GPS', href: '/dispositivos', icon: ShieldCheck },
    { key: 'geocercas', name: 'Geocercas', href: '/geocercas', icon: Map },
];

export function Sidebar() {
    const pathname = usePathname();
    const [mounted, setMounted] = useState(false);
    const { user } = useAuthStore();
    const { theme, setTheme } = useTheme();
    const isDark = theme === 'dark';

    useEffect(() => setMounted(true), []);

    const isAdmin = user?.role === 'SUPERADMIN';
    const isManager = isAdminUser(user); // rol con es_admin o SUPERADMIN
    const visiblePrimary = primaryItems.filter((i) => canAccessModule(user, i.key));
    const visibleTracking = trackingItems.filter((i) => canAccessModule(user, i.key));

    const NavLink = ({ href, name, Icon, badge }: { href: string; name: string; Icon: any; badge?: number }) => {
        const isActive = pathname === href;
        return (
            <Link
                href={href}
                className={clsx(
                    'flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm transition-colors',
                    isActive
                        ? 'bg-[#FFC933] text-[#1a1a1c] font-semibold'
                        : 'text-zinc-400 hover:bg-white/[0.06] hover:text-white'
                )}
            >
                <Icon size={18} className={clsx(isActive ? 'text-[#1a1a1c]' : 'text-zinc-400')} />
                <span className="flex-1">{name}</span>
                {badge ? (
                    <span className="min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-md bg-[#FFC933] text-[#1a1a1c] text-[11px] font-bold">
                        {badge}
                    </span>
                ) : null}
            </Link>
        );
    };

    const SectionDivider = () => <div className="my-3 border-t border-white/[0.07]" />;

    return (
        <aside className="w-[260px] shrink-0 h-full flex flex-col text-white">
            {/* Logo */}
            <div className="p-3">
                <div className="flex items-center gap-3 rounded-2xl bg-white/[0.05] px-3 py-2.5">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#FFD84D] to-[#F5A623] flex items-center justify-center relative overflow-hidden shrink-0">
                        <span className="absolute w-4 h-4 rounded-full bg-white/40 -left-0.5 -top-0.5" />
                        <span className="absolute w-4 h-4 rounded-full bg-black/10 -right-0.5 -bottom-0.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                        <h1 className="text-[15px] font-bold tracking-tight text-white leading-tight truncate">Logistica</h1>
                        <span className="text-xs text-zinc-500">Company</span>
                    </div>
                    <ChevronsLeft size={18} className="text-zinc-500" />
                </div>
            </div>

            {/* Nav */}
            <nav className="flex-1 overflow-y-auto px-3 pb-3">
                {visiblePrimary.length > 0 && (
                    <div className="space-y-1">
                        {visiblePrimary.map((item) => (
                            <NavLink key={item.href} href={item.href} name={item.name} Icon={item.icon} />
                        ))}
                    </div>
                )}

                {visibleTracking.length > 0 && (
                    <>
                        <SectionDivider />
                        <div className="space-y-1">
                            {visibleTracking.map((item) => (
                                <NavLink key={item.href} href={item.href} name={item.name} Icon={item.icon} />
                            ))}
                        </div>
                    </>
                )}

                {isManager && (
                    <>
                        <SectionDivider />
                        <div className="space-y-1">
                            <NavLink href="/admin/usuarios" name="Usuarios" Icon={UserCog} />
                            <NavLink href="/admin/roles" name="Roles" Icon={KeyRound} />
                            {isAdmin && <NavLink href="/admin/tenants" name="Admin Empresas" Icon={Briefcase} />}
                            <NavLink href="/admin/sheets" name="Integración Sheets" Icon={FileSpreadsheet} />
                        </div>
                    </>
                )}
            </nav>

            {/* Toggle de tema (claro / oscuro) */}
            {mounted && (
                <div className="px-3 pb-1">
                    <button
                        onClick={() => setTheme(isDark ? 'light' : 'dark')}
                        className="w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm text-zinc-400 hover:bg-white/[0.06] hover:text-white transition-colors"
                        title={isDark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
                    >
                        {isDark ? <Sun size={18} /> : <Moon size={18} />}
                        <span className="flex-1 text-left">{isDark ? 'Tema claro' : 'Tema oscuro'}</span>
                    </button>
                </div>
            )}

            {/* User card */}
            <div className="p-3">
                {mounted && user && (
                    <div className="flex items-center gap-3 rounded-2xl bg-white/[0.05] px-3 py-2.5">
                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-zinc-600 to-zinc-800 flex items-center justify-center text-white text-sm font-semibold shrink-0">
                            {user.email.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-white truncate">{user.email.split('@')[0]}</p>
                            <p className="text-xs text-zinc-500 truncate capitalize">{user.role ? user.role.toLowerCase() : 'Usuario'}</p>
                        </div>
                        <button
                            onClick={useAuthStore.getState().logout}
                            title="Cerrar Sesión"
                            className="p-1.5 text-zinc-500 hover:text-white transition-colors"
                        >
                            <LogOut size={17} />
                        </button>
                    </div>
                )}
            </div>
        </aside>
    );
}
