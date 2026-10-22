'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { Sidebar } from '@/components/shell/Sidebar';
import { Header } from '@/components/shell/Header';
import { CorrectionModal } from '@/components/correction-modal';
import {
  EventItem,
  AttendanceRecord,
  EventRegistration,
  Student,
} from '@/types';
import {
  CalendarDays,
  MapPin,
  Clock,
  ScanBarcode,
  Download,
  Users,
  CheckCircle2,
  AlertTriangle,
  Play,
  Square,
  Archive,
  UserPlus,
  Trash2,
  Edit3,
  ArrowLeft,
  Search,
} from 'lucide-react';

export default function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const eventId = Number(resolvedParams.id);
  const router = useRouter();
  const { user, isLoading: authLoading, isAdmin, isCoordinator } = useAuth();

  const [event, setEvent] = useState<EventItem | null>(null);
  const [attendances, setAttendances] = useState<AttendanceRecord[]>([]);
  const [registrations, setRegistrations] = useState<EventRegistration[]>([]);
  const [activeTab, setActiveTab] = useState<'ATTENDANCE' | 'REGISTRATIONS'>('ATTENDANCE');
  const [isLoading, setIsLoading] = useState(true);

  // Correction modal state
  const [selectedRecordForCorrection, setSelectedRecordForCorrection] = useState<AttendanceRecord | null>(null);
  const [isCorrectionModalOpen, setIsCorrectionModalOpen] = useState(false);

  // Student register modal
  const [isRegisterModalOpen, setIsRegisterModalOpen] = useState(false);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState<number | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }
    if (user && eventId) {
      loadEventDetails();
    }
  }, [user, authLoading, eventId]);

  const loadEventDetails = async () => {
    setIsLoading(true);
    try {
      const [evData, attData, regData] = await Promise.all([
        api.getEvent(eventId),
        api.getEventAttendance(eventId),
        api.getRegistrations(eventId),
      ]);
      setEvent(evData);
      setAttendances(attData);
      setRegistrations(regData);
    } catch (err) {
      console.error('Failed to load event data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStatusChange = async (targetStatus: string) => {
    if (!confirm(`Are you sure you want to transition event lifecycle to ${targetStatus}?`)) return;
    try {
      const updated = await api.changeEventStatus(eventId, targetStatus);
      setEvent(updated);
    } catch (err: any) {
      alert(err.message || 'Failed to update event status');
    }
  };

  const handleExportCsv = async () => {
    if (!event) return;
    try {
      await api.downloadEventCsv(event.id, `attendance_${event.event_code}.csv`);
    } catch (err: any) {
      alert('Failed to export CSV: ' + err.message);
    }
  };

  const openStudentRegisterModal = async () => {
    setIsRegisterModalOpen(true);
    try {
      const data = await api.getStudents({ limit: 100 });
      setAllStudents(data.items);
    } catch (err) {
      console.error(err);
    }
  };

  const handleRegisterStudent = async () => {
    if (!selectedStudentId) return;
    try {
      await api.registerStudent(eventId, selectedStudentId);
      setIsRegisterModalOpen(false);
      setSelectedStudentId(null);
      await loadEventDetails();
    } catch (err: any) {
      alert(err.message || 'Registration failed');
    }
  };

  const handleRemoveRegistration = async (studentId: number) => {
    if (!confirm('Remove this student registration?')) return;
    try {
      await api.removeRegistration(eventId, studentId);
      await loadEventDetails();
    } catch (err: any) {
      alert(err.message || 'Failed to cancel registration');
    }
  };

  if (isLoading || !event) {
    return (
      <div className="flex h-screen bg-neutral-950 items-center justify-center text-neutral-400 font-mono text-xs">
        Loading event #{eventId} data...
      </div>
    );
  }

  const presentCount = attendances.filter((a) => a.status === 'PRESENT').length;
  const lateCount = attendances.filter((a) => a.status === 'LATE').length;
  const excusedCount = attendances.filter((a) => a.status === 'EXCUSED').length;
  const registeredCount = registrations.length;
  const absentCount = Math.max(0, registeredCount - (presentCount + lateCount + excusedCount));

  return (
    <div className="flex h-screen bg-neutral-950 text-neutral-100 overflow-hidden font-sans">
      <Sidebar currentEventId={event.status === 'OPEN' ? event.id : undefined} />

      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <Header
          title={event.title}
          subtitle={`Event Code: ${event.event_code} • ${event.type}`}
          actionButton={
            <div className="flex items-center gap-2">
              <Link
                href="/events"
                className="px-3 py-1.5 rounded-lg border border-neutral-800 text-xs text-neutral-300 hover:bg-neutral-900 transition flex items-center gap-1.5"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Events</span>
              </Link>
              {event.status === 'OPEN' ? (
                <Link
                  href={`/events/${event.id}/scanner`}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition shadow-xs"
                >
                  <ScanBarcode className="w-3.5 h-3.5" />
                  <span>Launch Scanner</span>
                </Link>
              ) : null}
            </div>
          }
        />

        <main className="p-6 space-y-6 max-w-7xl">
          {/* Top Event Hero Banner & Controls */}
          <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-6 space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs font-mono font-bold text-blue-400 px-2 py-0.5 rounded bg-blue-950/80 border border-blue-800/40">
                    {event.event_code}
                  </span>
                  <span
                    className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded border ${
                      event.status === 'OPEN'
                        ? 'bg-emerald-950 text-emerald-400 border-emerald-800'
                        : event.status === 'SCHEDULED'
                        ? 'bg-blue-950 text-blue-400 border-blue-800'
                        : 'bg-neutral-800 text-neutral-400 border-neutral-700'
                    }`}
                  >
                    {event.status}
                  </span>
                </div>
                <h1 className="text-2xl font-bold text-white tracking-tight">{event.title}</h1>
                {event.description && (
                  <p className="text-xs text-neutral-400 mt-1 max-w-2xl">{event.description}</p>
                )}
              </div>

              {/* Lifecycle Controls */}
              {isCoordinator && (
                <div className="flex items-center gap-2 shrink-0">
                  {event.status === 'DRAFT' && (
                    <button
                      onClick={() => handleStatusChange('SCHEDULED')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-medium"
                    >
                      <span>Publish Event</span>
                    </button>
                  )}
                  {event.status === 'SCHEDULED' && (
                    <button
                      onClick={() => handleStatusChange('OPEN')}
                      className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-xs"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Start Attendance</span>
                    </button>
                  )}
                  {event.status === 'OPEN' && (
                    <button
                      onClick={() => handleStatusChange('CLOSED')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-semibold shadow-xs"
                    >
                      <Square className="w-3.5 h-3.5" />
                      <span>Close Attendance</span>
                    </button>
                  )}
                  {event.status === 'CLOSED' && (
                    <button
                      onClick={() => handleStatusChange('OPEN')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-700 text-neutral-300 hover:bg-neutral-800 text-xs font-medium"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Re-Open</span>
                    </button>
                  )}
                  <button
                    onClick={handleExportCsv}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-700 bg-neutral-900 text-neutral-200 hover:bg-neutral-800 text-xs font-medium"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export CSV</span>
                  </button>
                </div>
              )}
            </div>

            {/* Event Metadata row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-neutral-800 text-xs">
              <div>
                <span className="text-neutral-500 block text-[10px] uppercase font-semibold">Venue</span>
                <span className="text-neutral-200 font-medium flex items-center gap-1 mt-0.5">
                  <MapPin className="w-3.5 h-3.5 text-neutral-400" />
                  {event.venue}
                </span>
              </div>
              <div>
                <span className="text-neutral-500 block text-[10px] uppercase font-semibold">Time Window</span>
                <span className="text-neutral-200 font-mono mt-0.5 block">
                  {new Date(event.start_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} –{' '}
                  {new Date(event.end_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div>
                <span className="text-neutral-500 block text-[10px] uppercase font-semibold">Registration Rule</span>
                <span className="text-neutral-200 font-medium mt-0.5 block">
                  {event.registration_required ? 'Mandatory (Pre-registered only)' : 'Open Entry'}
                </span>
              </div>
              <div>
                <span className="text-neutral-500 block text-[10px] uppercase font-semibold">Late Threshold</span>
                <span className="text-neutral-200 font-mono mt-0.5 block">
                  {event.late_threshold_minutes} minutes
                </span>
              </div>
            </div>
          </div>

          {/* Key Operational Counts (SRS Required: Registered, Present, Late, Absent) */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-900/50">
              <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Registered</span>
              <div className="text-2xl font-bold text-white font-mono mt-1">{registeredCount}</div>
            </div>
            <div className="p-4 rounded-xl border border-emerald-950/80 bg-emerald-950/20">
              <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">Present</span>
              <div className="text-2xl font-bold text-emerald-400 font-mono mt-1">{presentCount}</div>
            </div>
            <div className="p-4 rounded-xl border border-amber-950/80 bg-amber-950/20">
              <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wider">Late Arrivals</span>
              <div className="text-2xl font-bold text-amber-400 font-mono mt-1">{lateCount}</div>
            </div>
            <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-900/50">
              <span className="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Absentees</span>
              <div className="text-2xl font-bold text-neutral-400 font-mono mt-1">{absentCount}</div>
            </div>
          </div>

          {/* Tabs: Attendance vs Registrations */}
          <div className="space-y-4">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
              <div className="flex items-center gap-4 text-xs font-semibold">
                <button
                  onClick={() => setActiveTab('ATTENDANCE')}
                  className={`pb-2 transition border-b-2 cursor-pointer ${
                    activeTab === 'ATTENDANCE'
                      ? 'border-blue-500 text-white font-bold'
                      : 'border-transparent text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  Live Attendance Records ({attendances.length})
                </button>
                <button
                  onClick={() => setActiveTab('REGISTRATIONS')}
                  className={`pb-2 transition border-b-2 cursor-pointer ${
                    activeTab === 'REGISTRATIONS'
                      ? 'border-blue-500 text-white font-bold'
                      : 'border-transparent text-neutral-400 hover:text-neutral-200'
                  }`}
                >
                  Registered Students ({registrations.length})
                </button>
              </div>

              {activeTab === 'REGISTRATIONS' && isCoordinator && (
                <button
                  onClick={openStudentRegisterModal}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Register Student</span>
                </button>
              )}
            </div>

            {/* Attendance Tab Table */}
            {activeTab === 'ATTENDANCE' && (
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-neutral-800 bg-neutral-950/60 text-[10px] uppercase text-neutral-500 font-semibold">
                      <th className="py-3 px-4">Student Name</th>
                      <th className="py-3 px-4">Enrollment No</th>
                      <th className="py-3 px-4">Department</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Scan Method</th>
                      <th className="py-3 px-4">Marked Time</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/60">
                    {attendances.map((att) => (
                      <tr key={att.id} className="hover:bg-neutral-800/30 transition font-mono">
                        <td className="py-3 px-4 font-sans font-medium text-white">{att.student?.name}</td>
                        <td className="py-3 px-4 text-neutral-300">{att.student?.enrollment_no}</td>
                        <td className="py-3 px-4 font-sans text-neutral-400">{att.student?.department}</td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                              att.status === 'PRESENT'
                                ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/60'
                                : att.status === 'LATE'
                                ? 'bg-amber-950 text-amber-400 border border-amber-800/60'
                                : att.status === 'EXCUSED'
                                ? 'bg-blue-950 text-blue-400 border border-blue-800/60'
                                : 'bg-red-950 text-red-400 border border-red-800/60'
                            }`}
                          >
                            {att.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-neutral-400 text-[11px] font-sans">{att.scan_method}</td>
                        <td className="py-3 px-4 text-neutral-400">
                          {new Date(att.marked_at).toLocaleTimeString()}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {isCoordinator && (
                            <button
                              onClick={() => {
                                setSelectedRecordForCorrection(att);
                                setIsCorrectionModalOpen(true);
                              }}
                              className="text-xs text-blue-400 hover:text-blue-300 font-sans font-medium inline-flex items-center gap-1"
                            >
                              <Edit3 className="w-3 h-3" />
                              <span>Correct</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {attendances.length === 0 && (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-xs text-neutral-500 font-sans">
                          No attendance marked for this event yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            {/* Registrations Tab Table */}
            {activeTab === 'REGISTRATIONS' && (
              <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-neutral-800 bg-neutral-950/60 text-[10px] uppercase text-neutral-500 font-semibold">
                      <th className="py-3 px-4">Enrollment</th>
                      <th className="py-3 px-4">Name</th>
                      <th className="py-3 px-4">Department</th>
                      <th className="py-3 px-4">Year</th>
                      <th className="py-3 px-4">Registered At</th>
                      <th className="py-3 px-4">Attendance Status</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/60">
                    {registrations.map((reg) => {
                      const hasAttended = attendances.find((a) => a.student_id === reg.student_id);
                      return (
                        <tr key={reg.id} className="hover:bg-neutral-800/30 transition font-mono">
                          <td className="py-3 px-4 text-neutral-300">{reg.student?.enrollment_no}</td>
                          <td className="py-3 px-4 font-sans font-medium text-white">{reg.student?.name}</td>
                          <td className="py-3 px-4 font-sans text-neutral-400">{reg.student?.department}</td>
                          <td className="py-3 px-4 font-sans text-neutral-400">{reg.student?.year}</td>
                          <td className="py-3 px-4 text-neutral-400">
                            {new Date(reg.registered_at).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-4">
                            {hasAttended ? (
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold text-emerald-400 bg-emerald-950 border border-emerald-800/60 font-sans uppercase">
                                Marked ({hasAttended.status})
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded text-[10px] text-neutral-400 bg-neutral-800 font-sans uppercase">
                                Pending
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right">
                            {isCoordinator && (
                              <button
                                onClick={() => handleRemoveRegistration(reg.student_id)}
                                title="Remove registration"
                                className="text-neutral-500 hover:text-red-400 transition"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
      </div>

      {/* Controlled Correction Modal */}
      <CorrectionModal
        record={selectedRecordForCorrection}
        isOpen={isCorrectionModalOpen}
        onClose={() => {
          setIsCorrectionModalOpen(false);
          setSelectedRecordForCorrection(null);
        }}
        onSuccess={() => {
          loadEventDetails();
        }}
      />

      {/* Register Student Dialog */}
      {isRegisterModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-neutral-100 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <h3 className="text-base font-bold text-white">Register Student for Event</h3>
              <button
                onClick={() => setIsRegisterModalOpen(false)}
                className="text-neutral-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="py-4 space-y-4">
              <div className="relative">
                <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  placeholder="Filter student by name or enrollment..."
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 pl-9 pr-3 py-2 text-xs text-white placeholder-neutral-500"
                />
              </div>

              <div className="max-h-60 overflow-y-auto space-y-1 rounded-lg border border-neutral-800 p-1 bg-neutral-950">
                {allStudents
                  .filter(
                    (s) =>
                      s.name.toLowerCase().includes(studentSearch.toLowerCase()) ||
                      s.enrollment_no.includes(studentSearch)
                  )
                  .slice(0, 30)
                  .map((s) => (
                    <button
                      key={s.id}
                      onClick={() => setSelectedStudentId(s.id)}
                      className={`w-full text-left p-2.5 rounded-md text-xs flex items-center justify-between transition cursor-pointer ${
                        selectedStudentId === s.id
                          ? 'bg-blue-600 text-white font-medium'
                          : 'hover:bg-neutral-900 text-neutral-300'
                      }`}
                    >
                      <div>
                        <div className="font-semibold">{s.name}</div>
                        <div className="text-[10px] opacity-75 font-mono">{s.department} • {s.enrollment_no}</div>
                      </div>
                      {selectedStudentId === s.id && <CheckCircle2 className="w-4 h-4" />}
                    </button>
                  ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-neutral-800">
              <button
                onClick={() => setIsRegisterModalOpen(false)}
                className="px-3 py-1.5 rounded-lg border border-neutral-700 text-xs text-neutral-300"
              >
                Cancel
              </button>
              <button
                onClick={handleRegisterStudent}
                disabled={!selectedStudentId}
                className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold disabled:opacity-50"
              >
                Confirm Registration
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
