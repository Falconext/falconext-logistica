
import Link from "next/link";
import { Users, Truck, Activity, ArrowRight, TrendingUp, AlertTriangle } from "lucide-react";

export default function Home() {
    return (
        <div className="space-y-8">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                        Panel de Control
                    </h1>
                    <p className="text-slate-400 mt-1">Visión general de operaciones logísticas</p>
                </div>
                <div className="flex gap-3">
                    <button className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition shadow-lg shadow-blue-900/20">
                        + Nuevo Envío
                    </button>
                </div>
            </div>

            {/* Main Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Card 1: Personal */}
                <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800 backdrop-blur-sm relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-br from-blue-600/10 to-transparent group-hover:from-blue-600/20 transition-all duration-500" />
                    <div className="relative z-10">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-2 bg-blue-900/30 rounded-lg text-blue-400">
                                <Users size={20} />
                            </div>
                            <span className="text-xs font-medium text-emerald-400 bg-emerald-900/20 px-2 py-1 rounded-full flex items-center gap-1">
                                <TrendingUp size={12} /> +12%
                            </span>
                        </div>
                        <h3 className="text-slate-400 text-sm font-medium">Personal Activo</h3>
                        <div className="flex items-baseline gap-2 mt-1">
                            <span className="text-3xl font-bold text-white">24</span>
                            <span className="text-xs text-slate-500">Total</span>
                        </div>
                    </div>
                </div>

                {/* Card 2: Flota */}
                <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800 backdrop-blur-sm relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-br from-purple-600/10 to-transparent group-hover:from-purple-600/20 transition-all duration-500" />
                    <div className="relative z-10">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-2 bg-purple-900/30 rounded-lg text-purple-400">
                                <Truck size={20} />
                            </div>
                            <span className="text-xs font-medium text-emerald-400 bg-emerald-900/20 px-2 py-1 rounded-full flex items-center gap-1">
                                <TrendingUp size={12} /> +5%
                            </span>
                        </div>
                        <h3 className="text-slate-400 text-sm font-medium">Flota Operativa</h3>
                        <div className="flex items-baseline gap-2 mt-1">
                            <span className="text-3xl font-bold text-white">12</span>
                            <span className="text-xs text-slate-500">Vehículos</span>
                        </div>
                    </div>
                </div>

                {/* Card 3: Issues */}
                <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800 backdrop-blur-sm relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-br from-orange-600/10 to-transparent group-hover:from-orange-600/20 transition-all duration-500" />
                    <div className="relative z-10">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-2 bg-orange-900/30 rounded-lg text-orange-400">
                                <AlertTriangle size={20} />
                            </div>
                        </div>
                        <h3 className="text-slate-400 text-sm font-medium">Alertas</h3>
                        <div className="flex items-baseline gap-2 mt-1">
                            <span className="text-3xl font-bold text-white">3</span>
                            <span className="text-xs text-slate-500">Requieren atención</span>
                        </div>
                    </div>
                </div>

                {/* Card 4: Efficiency */}
                <div className="p-6 rounded-2xl bg-slate-900/50 border border-slate-800 backdrop-blur-sm relative overflow-hidden group">
                    <div className="absolute inset-0 bg-gradient-to-br from-emerald-600/10 to-transparent group-hover:from-emerald-600/20 transition-all duration-500" />
                    <div className="relative z-10">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-2 bg-emerald-900/30 rounded-lg text-emerald-400">
                                <Activity size={20} />
                            </div>
                        </div>
                        <h3 className="text-slate-400 text-sm font-medium">Eficiencia</h3>
                        <div className="flex items-baseline gap-2 mt-1">
                            <span className="text-3xl font-bold text-white">98%</span>
                            <span className="text-xs text-slate-500">Esta semana</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Quick Access / Recent Activity */}
                <div className="lg:col-span-2 p-6 rounded-2xl bg-slate-900 border border-slate-800">
                    <h3 className="text-lg font-bold text-white mb-6">Actividad Reciente</h3>

                    <div className="space-y-6">
                        {[1, 2, 3].map((_, i) => (
                            <div key={i} className="flex items-start gap-4">
                                <div className="mt-1 w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]"></div>
                                <div className="flex-1">
                                    <p className="text-sm text-slate-300">
                                        El vehículo <span className="text-white font-medium">Fiat Doblo (ER643VY)</span> ha completado su ruta.
                                    </p>
                                    <span className="text-xs text-slate-500">Hace {i * 2 + 10} minutos</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Quick Links */}
                <div className="space-y-6">
                    <div className="p-6 rounded-2xl bg-gradient-to-br from-blue-900/50 to-slate-900 border border-slate-800">
                        <h3 className="text-lg font-bold text-white mb-2">Gestión Rápida</h3>
                        <p className="text-sm text-slate-400 mb-6">Accesos directos a las funciones más usadas.</p>

                        <div className="space-y-3">
                            <Link href="/trabajadores" className="block w-full p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition flex items-center justify-between group">
                                Gestión de Personal
                                <ArrowRight size={16} className="text-slate-500 group-hover:text-white transition" />
                            </Link>
                            <Link href="/vehiculos" className="block w-full p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium transition flex items-center justify-between group">
                                Control de Flota
                                <ArrowRight size={16} className="text-slate-500 group-hover:text-white transition" />
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
