'use client';

import { useEffect, useState } from 'react';
import api from '../../lib/api';
import { Programacion } from '../../types';
import { ChevronLeft, ChevronRight, Calendar, MapPin, Truck, User, Clock, X } from 'lucide-react';
import clsx from 'clsx';
import Link from 'next/link';

export default function CalendarioPage() {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [rutas, setRutas] = useState<Programacion[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDay, setSelectedDay] = useState<Date | null>(null);
    const [dayRutas, setDayRutas] = useState<Programacion[]>([]);

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    useEffect(() => {
        async function fetchData() {
            setLoading(true);
            try {
                // Only fetch the visible month instead of the whole dataset.
                const from = new Date(year, month, 1).toISOString();
                const to = new Date(year, month + 1, 0, 23, 59, 59).toISOString();
                const res = await api.get('/programacion', { params: { from, to, take: 1000 } });
                setRutas(res.data.items ?? []);
            } catch (error) {
                console.error('Error fetching operations:', error);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [year, month]);

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const startingDayOfWeek = firstDayOfMonth.getDay(); // 0 = Sunday
    const daysInMonth = lastDayOfMonth.getDate();

    const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

    const goToPreviousMonth = () => {
        setCurrentDate(new Date(year, month - 1, 1));
    };

    const goToNextMonth = () => {
        setCurrentDate(new Date(year, month + 1, 1));
    };

    const goToToday = () => {
        setCurrentDate(new Date());
    };

    const getRutasForDay = (day: number): Programacion[] => {
        const dateStr = new Date(year, month, day).toISOString().split('T')[0];
        return rutas.filter(r => {
            const rutaDate = new Date(r.fecha).toISOString().split('T')[0];
            return rutaDate === dateStr;
        });
    };

    const handleDayClick = (day: number) => {
        const date = new Date(year, month, day);
        setSelectedDay(date);
        setDayRutas(getRutasForDay(day));
    };

    const isToday = (day: number) => {
        const today = new Date();
        return today.getDate() === day &&
            today.getMonth() === month &&
            today.getFullYear() === year;
    };

    // Generate calendar grid
    const calendarDays = [];

    // Empty cells for days before the first day of month
    for (let i = 0; i < startingDayOfWeek; i++) {
        calendarDays.push(null);
    }

    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
        calendarDays.push(day);
    }

    if (loading) {
        return (
            <div className="flex h-[50vh] items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <div className="h-10 w-10 rounded-full border-4 border-blue-500/30 border-t-blue-500 animate-spin"></div>
                    <span className="text-slate-500">Cargando calendario...</span>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-6">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
                        <Calendar className="text-blue-500 shrink-0" />
                        Calendario de Operaciones
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">
                        Vista mensual de rutas programadas
                    </p>
                </div>
                <Link href="/operaciones" className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
                    ← Volver a lista de operaciones
                </Link>
            </div>

            {/* Calendar Container */}
            <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                {/* Calendar Header */}
                <div className="flex items-center justify-between gap-2 p-3 sm:p-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                    <div className="flex items-center gap-1 sm:gap-2 min-w-0">
                        <button
                            onClick={goToPreviousMonth}
                            className="shrink-0 p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition text-slate-600 dark:text-slate-400"
                        >
                            <ChevronLeft size={20} />
                        </button>
                        <h2 className="text-base sm:text-xl font-bold text-slate-900 dark:text-white min-w-[110px] sm:min-w-[200px] text-center truncate">
                            {monthNames[month]} {year}
                        </h2>
                        <button
                            onClick={goToNextMonth}
                            className="shrink-0 p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition text-slate-600 dark:text-slate-400"
                        >
                            <ChevronRight size={20} />
                        </button>
                    </div>
                    <button
                        onClick={goToToday}
                        className="shrink-0 px-3 sm:px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition"
                    >
                        Hoy
                    </button>
                </div>

                {/* Day Names Header */}
                <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-800">
                    {dayNames.map(day => (
                        <div key={day} className="p-1.5 sm:p-3 text-center text-[10px] sm:text-xs font-bold uppercase text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900/30">
                            {day}
                        </div>
                    ))}
                </div>

                {/* Calendar Grid */}
                <div className="grid grid-cols-7">
                    {calendarDays.map((day, idx) => {
                        const dayRutasCount = day ? getRutasForDay(day).length : 0;
                        const isCurrentDay = day && isToday(day);
                        const isSelected = day && selectedDay?.getDate() === day && selectedDay?.getMonth() === month;

                        return (
                            <div
                                key={idx}
                                onClick={() => day && handleDayClick(day)}
                                className={clsx(
                                    "min-w-0 min-h-[72px] sm:min-h-[100px] p-1 sm:p-2 border-b border-r border-slate-100 dark:border-slate-800 transition-colors",
                                    day ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" : "bg-slate-50/50 dark:bg-slate-900/20",
                                    isSelected && "bg-blue-50 dark:bg-blue-900/20 ring-2 ring-inset ring-blue-500",
                                    isCurrentDay && !isSelected && "bg-blue-50/50 dark:bg-blue-900/10"
                                )}
                            >
                                {day && (
                                    <>
                                        <div className={clsx(
                                            "inline-flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-full text-xs sm:text-sm font-medium mb-1",
                                            isCurrentDay
                                                ? "bg-blue-600 text-white"
                                                : "text-slate-700 dark:text-slate-300"
                                        )}>
                                            {day}
                                        </div>
                                        {dayRutasCount > 0 && (
                                            <div className="space-y-1">
                                                {dayRutasCount <= 2 ? (
                                                    getRutasForDay(day).slice(0, 2).map((ruta, i) => (
                                                        <div
                                                            key={i}
                                                            className="text-[11px] sm:text-xs px-1.5 sm:px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 truncate"
                                                        >
                                                            <span className="font-medium">{ruta.trabajador_id?.substring(0, 6) || 'Sin asignar'}</span>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div className="text-[11px] sm:text-xs px-1.5 sm:px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-bold text-center truncate">
                                                        {dayRutasCount} rutas
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Day Detail Modal */}
            {selectedDay && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl w-full max-w-lg overflow-hidden">
                        <div className="flex justify-between items-center p-4 border-b border-slate-100 dark:border-slate-800">
                            <div>
                                <h3 className="font-bold text-lg text-slate-900 dark:text-white">
                                    {selectedDay.toLocaleDateString('es-ES', {
                                        weekday: 'long',
                                        year: 'numeric',
                                        month: 'long',
                                        day: 'numeric'
                                    })}
                                </h3>
                                <p className="text-sm text-slate-500">{dayRutas.length} operaciones programadas</p>
                            </div>
                            <button
                                onClick={() => setSelectedDay(null)}
                                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition text-slate-500"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-4 max-h-[400px] overflow-y-auto">
                            {dayRutas.length === 0 ? (
                                <div className="text-center py-8 text-slate-500">
                                    <Calendar size={48} className="mx-auto mb-3 opacity-30" />
                                    <p>No hay operaciones programadas para este día.</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {dayRutas.map((ruta, idx) => (
                                        <div
                                            key={idx}
                                            className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-700"
                                        >
                                            <div className="flex items-center gap-3 mb-3">
                                                <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                                                    <Truck size={16} />
                                                </div>
                                                <div>
                                                    <p className="font-medium text-slate-900 dark:text-white">
                                                        {ruta.vehiculo_id || 'Sin vehículo'}
                                                    </p>
                                                    <p className="text-xs text-slate-500 flex items-center gap-1">
                                                        <User size={12} /> {ruta.trabajador_id || 'Sin asignar'}
                                                    </p>
                                                </div>
                                            </div>

                                            <div className="space-y-2 text-sm">
                                                <div className="flex items-center gap-2">
                                                    <div className="h-2 w-2 rounded-full bg-emerald-500"></div>
                                                    <span className="text-slate-600 dark:text-slate-300 truncate">
                                                        {ruta.lugar_retiro || 'Origen no especificado'}
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <div className="h-2 w-2 rounded-full bg-red-500"></div>
                                                    <span className="text-slate-600 dark:text-slate-300 truncate">
                                                        {ruta.lugar_entrega || 'Destino no especificado'}
                                                    </span>
                                                </div>
                                            </div>

                                            {ruta.hora_retiro && (
                                                <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                                                    <Clock size={12} />
                                                    <span>Hora de retiro: {ruta.hora_retiro}</span>
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                            <Link
                                href="/operaciones"
                                className="block w-full text-center py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition"
                            >
                                Ver todas las operaciones
                            </Link>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
