'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { Sidebar } from '@/components/shell/Sidebar';
import { Header } from '@/components/shell/Header';
import { EventItem, SocietyReportData, EventReportData } from '@/types';
import {
  FileSpreadsheet,
  Download,
  CalendarDays,
  Users,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowRight,
  Filter,
} from 'lucide-react';

export default function ReportsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const [societyReport, setSocietyReport] = useState<SocietyReportData | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [eventReport, setEventReport] = useState<EventReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }
    if (user) {
      loadInitialData();
    }
  }, [user, authLoading]);

  const loadInitialData = async () => {
    setIsLoading(true);
    try {
      const [socData, eventsData] = await Promise.all([
        api.getSocietyReport(),
        api.getEvents(),
      ]);
      setSocietyReport(socData);
      setEvents(eventsData);
      if (eventsData.length > 0) {
        setSelectedEventId(eventsData[0].id);
        const rep = await api.getEventReport(eventsData[0].id);
        setEventReport(rep);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectEvent = async (id: number) => {
    setSelectedEventId(id);
    try {
      const rep = await api.getEventReport(id);
      setEventReport(rep);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDownloadCsv = async (eventId: number, code: string) => {
    setIsDownloading(true);
    try {
      await api.downloadEventCsv(eventId, `attendance_${code}.csv`);
    } catch (err: any) {
      alert(err.message || 'CSV download failed');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="flex h-screen bg-neutral-950 text-neutral-100 overflow-hidden font-sans">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <Header
          title="Reporting & Operational Analytics"
          subtitle="Generate verified event reports, compute turnout metrics, and export compliant attendance CSVs"
        />

        <main className="p-3.5 sm:p-6 pb-24 md:pb-8 space-y-6 max-w-7xl">
          {/* Society Level High-Level Rollup */}
          <div className="space-y-3">
            <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
              Society-Wide Attendance Rollup
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-900/40">
                <span className="text-[10px] text-neutral-500 uppercase font-semibold">Total Students</span>
                <div className="text-2xl font-bold text-white font-mono mt-1">
                  {societyReport?.total_students ?? '—'}
                </div>
              </div>
              <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-900/40">
                <span className="text-[10px] text-neutral-500 uppercase font-semibold">Total Events</span>
                <div className="text-2xl font-bold text-white font-mono mt-1">
                  {societyReport?.total_events ?? '—'}
                </div>
              </div>
              <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-900/40">
                <span className="text-[10px] text-neutral-500 uppercase font-semibold">Attendance Volume</span>
                <div className="text-2xl font-bold text-blue-400 font-mono mt-1">
                  {societyReport?.total_attendance_volume ?? '—'}
                </div>
              </div>
              <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-900/40">
                <span className="text-[10px] text-neutral-500 uppercase font-semibold">Average Turnout Rate</span>
                <div className="text-2xl font-bold text-emerald-400 font-mono mt-1">
                  {societyReport?.average_attendance_percentage ? `${societyReport.average_attendance_percentage}%` : '—'}
                </div>
              </div>
            </div>
          </div>

          {/* Event-Wise Detailed Inspection & CSV Export */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                Event-Specific Breakdown & Verification
              </h2>
              {eventReport && (
                <button
                  disabled={isDownloading}
                  onClick={() => handleDownloadCsv(eventReport.event_id, eventReport.event_code)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition cursor-pointer shadow-xs disabled:opacity-50"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{isDownloading ? 'Preparing CSV...' : 'Download Event CSV'}</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Event Selector List */}
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3 space-y-1.5 max-h-[460px] overflow-y-auto">
                <div className="px-2 py-1 text-[11px] font-semibold text-neutral-500 uppercase">
                  Select Event
                </div>
                {events.map((ev) => (
                  <button
                    key={ev.id}
                    onClick={() => handleSelectEvent(ev.id)}
                    className={`w-full text-left p-3 rounded-lg text-xs transition cursor-pointer ${
                      selectedEventId === ev.id
                        ? 'bg-neutral-800 border border-neutral-700 text-white font-semibold'
                        : 'text-neutral-400 hover:bg-neutral-900 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-blue-400 font-bold">{ev.event_code}</span>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-neutral-950 text-neutral-400">
                        {ev.status}
                      </span>
                    </div>
                    <div className="truncate mt-1 text-sm font-sans">{ev.title}</div>
                    <div className="text-[10px] text-neutral-500 font-mono mt-1">
                      {new Date(ev.start_datetime).toLocaleDateString()}
                    </div>
                  </button>
                ))}
              </div>

              {/* Event Report Breakdown Card */}
              {eventReport ? (
                <div className="lg:col-span-2 rounded-xl border border-neutral-800 bg-neutral-900/60 p-6 space-y-6">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-bold text-blue-400 px-2 py-0.5 rounded bg-blue-950 border border-blue-800/40">
                        {eventReport.event_code}
                      </span>
                      <span className="text-xs font-mono text-neutral-400 px-2 py-0.5 rounded bg-neutral-800">
                        {eventReport.status}
                      </span>
                    </div>
                    <h3 className="text-xl font-bold text-white mt-2">{eventReport.title}</h3>
                    <div className="text-xs text-neutral-400 mt-1">
                      Venue: {eventReport.venue} • {new Date(eventReport.start_datetime).toLocaleString()}
                    </div>
                  </div>

                  {/* Operational breakdown grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3.5 rounded-lg bg-neutral-950 border border-neutral-800 text-center">
                      <span className="text-[10px] text-neutral-500 uppercase font-semibold">Registered</span>
                      <div className="text-xl font-bold text-white font-mono mt-1">
                        {eventReport.total_registered}
                      </div>
                    </div>
                    <div className="p-3.5 rounded-lg bg-emerald-950/40 border border-emerald-800/40 text-center">
                      <span className="text-[10px] text-emerald-400 uppercase font-semibold">Present</span>
                      <div className="text-xl font-bold text-emerald-400 font-mono mt-1">
                        {eventReport.total_present}
                      </div>
                    </div>
                    <div className="p-3.5 rounded-lg bg-amber-950/40 border border-amber-800/40 text-center">
                      <span className="text-[10px] text-amber-400 uppercase font-semibold">Late</span>
                      <div className="text-xl font-bold text-amber-400 font-mono mt-1">
                        {eventReport.total_late}
                      </div>
                    </div>
                    <div className="p-3.5 rounded-lg bg-neutral-950 border border-neutral-800 text-center">
                      <span className="text-[10px] text-neutral-500 uppercase font-semibold">Absent</span>
                      <div className="text-xl font-bold text-neutral-400 font-mono mt-1">
                        {eventReport.total_absent}
                      </div>
                    </div>
                  </div>

                  {/* Percentage Progress Bar */}
                  <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-neutral-400 font-medium">Turnout Percentage</span>
                      <span className="text-emerald-400 font-mono font-bold">
                        {eventReport.attendance_percentage}%
                      </span>
                    </div>
                    <div className="w-full h-2.5 rounded-full bg-neutral-800 overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-500 rounded-full"
                        style={{ width: `${Math.min(100, eventReport.attendance_percentage)}%` }}
                      />
                    </div>
                  </div>

                  {/* Quick CSV Export Note */}
                  <div className="p-3.5 rounded-lg bg-neutral-950/80 border border-neutral-800 text-xs text-neutral-400 flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-neutral-300">Format:</span> RFC-4180 CSV with Enrollment No, Full Name, Department, Year, Status, and Timestamp.
                    </div>
                    <button
                      disabled={isDownloading}
                      onClick={() => handleDownloadCsv(eventReport.event_id, eventReport.event_code)}
                      className="text-xs text-blue-400 hover:text-blue-300 font-medium inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="lg:col-span-2 p-12 text-center text-xs text-neutral-500 border border-dashed border-neutral-800 rounded-xl">
                  Select an event from the left list to review attendance analytics.
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
