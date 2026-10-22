'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { Sidebar } from '@/components/shell/Sidebar';
import { Header } from '@/components/shell/Header';
import { EventItem, EventStatus } from '@/types';
import {
  CalendarDays,
  Plus,
  ScanBarcode,
  Search,
  Filter,
  MapPin,
  Clock,
  ArrowRight,
  X,
  AlertCircle,
} from 'lucide-react';
import DateTimePicker from '@/components/DateTimePicker';

export default function EventsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAdmin, isCoordinator } = useAuth();
  const [events, setEvents] = useState<EventItem[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<EventItem[]>([]);
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [search, setSearch] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);

  // Create Event Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const [formCode, setFormCode] = useState('');
  const [formTitle, setFormTitle] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formType, setFormType] = useState('WORKSHOP');
  const [formVenue, setFormVenue] = useState('');
  const [formStart, setFormStart] = useState('');
  const [formEnd, setFormEnd] = useState('');
  const [formRegRequired, setFormRegRequired] = useState(false);
  const [formLateThreshold, setFormLateThreshold] = useState(15);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }
    if (user) {
      loadEvents();
    }
  }, [user, authLoading]);

  const loadEvents = async () => {
    setIsLoading(true);
    try {
      const data = await api.getEvents();
      setEvents(data);
      applyFilter(data, selectedStatus, search);
    } catch (err) {
      console.error('Failed to load events:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const applyFilter = (data: EventItem[], status: string, query: string) => {
    let result = [...data];
    if (status !== 'ALL') {
      result = result.filter((e) => e.status === status);
    }
    if (query.trim()) {
      const q = query.toLowerCase();
      result = result.filter(
        (e) =>
          e.title.toLowerCase().includes(q) ||
          e.event_code.toLowerCase().includes(q) ||
          e.venue.toLowerCase().includes(q)
      );
    }
    setFilteredEvents(result);
  };

  const handleStatusChange = (st: string) => {
    setSelectedStatus(st);
    applyFilter(events, st, search);
  };

  const handleSearchChange = (q: string) => {
    setSearch(q);
    applyFilter(events, selectedStatus, q);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setModalError(null);

    if (!formStart || !formEnd) {
      setModalError('Please select both Start and End date/time using the calendar & watch interface.');
      return;
    }

    setIsCreating(true);

    try {
      await api.createEvent({
        event_code: formCode.trim().toUpperCase(),
        title: formTitle.trim(),
        description: formDesc.trim() || undefined,
        type: formType,
        venue: formVenue.trim(),
        start_datetime: new Date(formStart).toISOString(),
        end_datetime: new Date(formEnd).toISOString(),
        registration_required: formRegRequired,
        attendance_required: true,
        late_threshold_minutes: Number(formLateThreshold) || 15,
      });

      setIsModalOpen(false);
      resetForm();
      await loadEvents();
    } catch (err: any) {
      setModalError(err.message || 'Failed to create event');
    } finally {
      setIsCreating(false);
    }
  };

  const resetForm = () => {
    setFormCode('');
    setFormTitle('');
    setFormDesc('');
    setFormType('WORKSHOP');
    setFormVenue('');
    setFormStart('');
    setFormEnd('');
    setFormRegRequired(false);
    setFormLateThreshold(15);
  };

  return (
    <div className="flex h-screen bg-neutral-950 text-neutral-100 overflow-hidden font-sans">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <Header
          title="Society Events Management"
          subtitle="Configure event schedules, registration policies, and operational statuses"
          actionButton={
            isCoordinator && (
              <button
                onClick={() => setIsModalOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Event</span>
              </button>
            )
          }
        />

        <main className="p-3.5 sm:p-6 space-y-6 max-w-7xl pb-24 md:pb-8">
          {/* Filters & Search Toolbar */}
          <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="flex items-center gap-1 p-1 rounded-xl bg-neutral-900 border border-neutral-800 text-xs overflow-x-auto max-w-full">
              {['ALL', 'OPEN', 'SCHEDULED', 'CLOSED', 'DRAFT'].map((tab) => (
                <button
                  key={tab}
                  onClick={() => handleStatusChange(tab)}
                  className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                    selectedStatus === tab
                      ? 'bg-neutral-800 text-white font-semibold shadow-xs'
                      : 'text-neutral-400 hover:text-white'
                  }`}
                >
                  {tab === 'OPEN' ? 'Scanning Open' : tab}
                </button>
              ))}
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Search event code or title..."
                className="w-full rounded-lg border border-neutral-800 bg-neutral-900 pl-9 pr-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-hidden focus:border-blue-500 transition"
              />
            </div>
          </div>

          {/* Events Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredEvents.map((ev) => (
              <div
                key={ev.id}
                className="rounded-xl border border-neutral-800 bg-neutral-900/60 p-5 space-y-4 hover:border-neutral-700 transition flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-bold text-blue-400 px-2 py-0.5 rounded bg-blue-950/60 border border-blue-800/40">
                      {ev.event_code}
                    </span>
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                        ev.status === 'OPEN'
                          ? 'bg-emerald-950 text-emerald-400 border-emerald-800/60'
                          : ev.status === 'SCHEDULED'
                          ? 'bg-blue-950 text-blue-400 border-blue-800/60'
                          : ev.status === 'CLOSED'
                          ? 'bg-neutral-800 text-neutral-400 border-neutral-700'
                          : 'bg-neutral-900 text-neutral-500 border-neutral-800'
                      }`}
                    >
                      {ev.status}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-white mt-2.5 leading-snug">{ev.title}</h3>

                  <div className="text-xs text-neutral-400 space-y-1 mt-3">
                    <div className="flex items-center gap-1.5 truncate">
                      <MapPin className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                      <span className="truncate">{ev.venue}</span>
                    </div>
                    <div className="flex items-center gap-1.5 font-mono text-neutral-400">
                      <Clock className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                      <span>{new Date(ev.start_datetime).toLocaleDateString()} • {new Date(ev.start_datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-neutral-800/80 flex items-center justify-between">
                  <div className="text-xs font-mono">
                    <span className="text-emerald-400 font-bold">{ev.total_present || 0}</span>
                    <span className="text-neutral-500"> / {ev.total_registered || 0}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    {ev.status === 'OPEN' && (
                      <Link
                        href={`/events/${ev.id}/scanner`}
                        className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition"
                      >
                        <ScanBarcode className="w-3.5 h-3.5" />
                        <span>Scanner</span>
                      </Link>
                    )}
                    <Link
                      href={`/events/${ev.id}`}
                      className="px-2.5 py-1 rounded border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-neutral-200 transition"
                    >
                      Details
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {filteredEvents.length === 0 && !isLoading && (
            <div className="py-16 text-center text-xs text-neutral-500 border border-dashed border-neutral-800 rounded-xl">
              No events found matching the selected filters.
            </div>
          )}
        </main>
      </div>

      {/* Create Event Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-xl rounded-2xl border border-neutral-800 bg-neutral-900 shadow-2xl p-6 text-neutral-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
              <h3 className="text-base font-bold text-white">Create New Society Event</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {modalError && (
              <div className="my-4 p-3 rounded-lg bg-red-950/60 border border-red-800 text-red-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleCreateSubmit} className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">
                    Event Code <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={formCode}
                    onChange={(e) => setFormCode(e.target.value)}
                    placeholder="e.g. EVT-2026-005"
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-white uppercase font-mono focus:outline-hidden focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1">Event Type</label>
                  <select
                    value={formType}
                    onChange={(e) => setFormType(e.target.value)}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-white focus:outline-hidden focus:border-blue-500"
                  >
                    <option value="WORKSHOP">WORKSHOP</option>
                    <option value="BOOTCAMP">BOOTCAMP</option>
                    <option value="MEETING">MEETING</option>
                    <option value="RECRUITMENT">RECRUITMENT</option>
                    <option value="COMPETITION">COMPETITION</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Event Title <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="e.g. Full-Stack Systems Workshop"
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-white focus:outline-hidden focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">Description</label>
                <textarea
                  rows={2}
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="Operational details and syllabus..."
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-white focus:outline-hidden focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Venue <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formVenue}
                  onChange={(e) => setFormVenue(e.target.value)}
                  placeholder="e.g. Seminar Hall 2, Block A"
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs text-white focus:outline-hidden focus:border-blue-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <DateTimePicker
                  label="Start Date & Time"
                  required
                  value={formStart}
                  onChange={setFormStart}
                  placeholder="Pick start date & time"
                />
                <DateTimePicker
                  label="End Date & Time"
                  required
                  value={formEnd}
                  onChange={setFormEnd}
                  placeholder="Pick end date & time"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="regRequired"
                    checked={formRegRequired}
                    onChange={(e) => setFormRegRequired(e.target.checked)}
                    className="rounded border-neutral-700 text-blue-600 focus:ring-0"
                  />
                  <label htmlFor="regRequired" className="text-xs text-neutral-300">
                    Pre-Registration Required
                  </label>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-neutral-400 mb-1">
                    Late Threshold (mins)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={formLateThreshold}
                    onChange={(e) => setFormLateThreshold(Number(e.target.value))}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-xs text-white font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-neutral-700 text-xs text-neutral-300 hover:bg-neutral-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
                >
                  {isCreating ? 'Creating Event...' : 'Create Event'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
