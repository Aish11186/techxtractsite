'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { Sidebar } from '@/components/shell/Sidebar';
import { Header } from '@/components/shell/Header';
import { SocietyReportData, EventItem } from '@/types';
import {
  Users,
  CalendarDays,
  CheckCircle2,
  ScanBarcode,
  ArrowRight,
  Plus,
  Upload,
  Clock,
  MapPin,
  ShieldCheck,
} from 'lucide-react';

export default function DashboardPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [societyStats, setSocietyStats] = useState<SocietyReportData | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }

    if (user) {
      loadDashboardData();
    }
  }, [user, authLoading]);

  const loadDashboardData = async () => {
    setIsLoading(true);
    try {
      const [statsData, eventsData] = await Promise.all([
        api.getSocietyReport(),
        api.getEvents(),
      ]);
      setSocietyStats(statsData);
      setEvents(eventsData);
    } catch (err) {
      console.error('Failed to load dashboard metrics:', err);
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading || (!user && isLoading)) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-neutral-400 font-mono text-sm">
        Loading TechX Terminal...
      </div>
    );
  }

  const activeEvents = events.filter((e) => e.status === 'OPEN');
  const upcomingEvents = events.filter((e) => e.status === 'SCHEDULED' || e.status === 'DRAFT');

  return (
    <div className="flex h-screen bg-neutral-950 text-neutral-100 overflow-hidden font-sans">
      <Sidebar currentEventId={activeEvents[0]?.id} />

      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <Header
          title="Society Attendance Overview"
          subtitle="Real-time operational metrics and event management"
          actionButton={
            <Link
              href="/events"
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Event</span>
            </Link>
          }
        />

        <main className="p-3.5 sm:p-6 space-y-6 max-w-7xl pb-24 md:pb-8">
          {/* Key Operational Overview Counts (SRS Specified) */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 rounded-xl border border-neutral-800 bg-neutral-900/50 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                  Enrolled Students
                </div>
                <div className="text-3xl font-bold text-white mt-1.5 font-mono">
                  {societyStats?.total_students ?? '—'}
                </div>
                <div className="text-[11px] text-neutral-500 mt-1">Pre-registered society members</div>
              </div>
              <div className="w-12 h-12 rounded-xl bg-blue-950/40 border border-blue-800/40 flex items-center justify-center text-blue-400">
                <Users className="w-6 h-6" />
              </div>
            </div>

            <div className="p-5 rounded-xl border border-neutral-800 bg-neutral-900/50 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                  Society Events
                </div>
                <div className="text-3xl font-bold text-white mt-1.5 font-mono">
                  {societyStats?.total_events ?? '—'}
                </div>
                <div className="text-[11px] text-emerald-400 font-mono mt-1 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  {societyStats?.active_events_count || 0} currently accepting attendance
                </div>
              </div>
              <div className="w-12 h-12 rounded-xl bg-neutral-800 flex items-center justify-center text-neutral-300">
                <CalendarDays className="w-6 h-6" />
              </div>
            </div>

            <div className="p-5 rounded-xl border border-neutral-800 bg-neutral-900/50 flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                  Attendance Records
                </div>
                <div className="text-3xl font-bold text-white mt-1.5 font-mono">
                  {societyStats?.total_attendance_volume ?? '—'}
                </div>
                <div className="text-[11px] text-neutral-500 mt-1">All cryptographically hash-chained</div>
              </div>
              <div className="w-12 h-12 rounded-xl bg-emerald-950/40 border border-emerald-800/40 flex items-center justify-center text-emerald-400">
                <CheckCircle2 className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Quick Operational Shortcuts */}
          <div className="p-4 rounded-xl border border-neutral-800/80 bg-neutral-900/30 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">Primary Actions:</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Link
                href="/events"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-700 bg-neutral-900 text-xs font-medium text-neutral-200 hover:bg-neutral-800 transition"
              >
                <CalendarDays className="w-3.5 h-3.5 text-neutral-400" />
                View All Events
              </Link>
              <Link
                href="/students"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-700 bg-neutral-900 text-xs font-medium text-neutral-200 hover:bg-neutral-800 transition"
              >
                <Users className="w-3.5 h-3.5 text-neutral-400" />
                Manage Students
              </Link>
              <Link
                href="/audit"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-700 bg-neutral-900 text-xs font-medium text-neutral-200 hover:bg-neutral-800 transition"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Verify Audit Chain
              </Link>
            </div>
          </div>

          {/* Active / Today's Events (Ready for Scanning) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white uppercase tracking-wider flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Active Scanning Terminals
              </h2>
              <span className="text-xs text-neutral-500">{activeEvents.length} open</span>
            </div>

            {activeEvents.length === 0 ? (
              <div className="p-8 rounded-xl border border-dashed border-neutral-800 bg-neutral-900/20 text-center text-xs text-neutral-400">
                No events currently open for attendance. Start attendance on any scheduled event to begin scanning.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeEvents.map((ev) => (
                  <div
                    key={ev.id}
                    className="p-5 rounded-xl border border-emerald-900/50 bg-neutral-900/90 shadow-md space-y-4 hover:border-emerald-700/60 transition group"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-blue-400 px-2 py-0.5 rounded bg-blue-950/60 border border-blue-800/40">
                            {ev.event_code}
                          </span>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/50">
                            SCANNING OPEN
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-white mt-1.5 group-hover:text-blue-300 transition">
                          {ev.title}
                        </h3>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs text-neutral-400 pt-2 border-t border-neutral-800/80">
                      <div className="flex items-center gap-1.5 truncate">
                        <MapPin className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                        <span className="truncate">{ev.venue}</span>
                      </div>
                      <div className="flex items-center gap-1.5 font-mono">
                        <Clock className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                        <span>{new Date(ev.start_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-neutral-800/80">
                      <div className="text-xs font-mono">
                        <span className="text-emerald-400 font-bold text-sm">{ev.total_present || 0}</span>
                        <span className="text-neutral-500"> / {ev.total_registered || 0} registered</span>
                      </div>
                      <Link
                        href={`/events/${ev.id}/scanner`}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition shadow-xs"
                      >
                        <ScanBarcode className="w-3.5 h-3.5" />
                        <span>Open Terminal</span>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Scheduled & Upcoming Events */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
                Upcoming & Scheduled Events
              </h2>
              <Link href="/events" className="text-xs text-blue-400 hover:underline flex items-center gap-1">
                <span>View all</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-neutral-800 bg-neutral-950/60 text-[10px] uppercase text-neutral-500 font-semibold">
                    <th className="py-3 px-4">Event Code</th>
                    <th className="py-3 px-4">Title</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Venue</th>
                    <th className="py-3 px-4">Date / Time</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60">
                  {upcomingEvents.slice(0, 5).map((ev) => (
                    <tr key={ev.id} className="hover:bg-neutral-800/30 transition">
                      <td className="py-3 px-4 font-mono font-medium text-blue-400">{ev.event_code}</td>
                      <td className="py-3 px-4 font-medium text-white">{ev.title}</td>
                      <td className="py-3 px-4 text-neutral-400">{ev.type}</td>
                      <td className="py-3 px-4 text-neutral-400">{ev.venue}</td>
                      <td className="py-3 px-4 text-neutral-400 font-mono">
                        {new Date(ev.start_datetime).toLocaleDateString()} • {new Date(ev.start_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-neutral-800 text-neutral-300">
                          {ev.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <Link
                          href={`/events/${ev.id}`}
                          className="text-blue-400 hover:text-blue-300 font-medium inline-flex items-center gap-1"
                        >
                          <span>Manage</span>
                          <ArrowRight className="w-3 h-3" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                  {upcomingEvents.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-neutral-500">
                        No upcoming events scheduled.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
