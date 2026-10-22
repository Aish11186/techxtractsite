'use client';

export const dynamic = 'force-dynamic';

import React, { useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { ScannerTerminal } from '@/components/scanner/ScannerTerminal';
import { EventItem } from '@/types';
import { ArrowLeft, ScanBarcode, Radio, Sparkles } from 'lucide-react';

export default function EventScannerPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const eventId = Number(resolvedParams.id);
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [event, setEvent] = useState<EventItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }
    if (user && eventId) {
      loadEvent();
    }
  }, [user, authLoading, eventId]);

  const loadEvent = async () => {
    setIsLoading(true);
    try {
      const data = await api.getEvent(eventId);
      setEvent(data);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading || !event) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-neutral-400 font-mono text-xs">
        Initializing High-Throughput Scanner Terminal #{eventId}...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col font-sans">
      {/* Top Distraction-Free Header */}
      <header className="h-14 px-3 sm:px-6 border-b border-neutral-800 bg-neutral-900/70 backdrop-blur-xs flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 truncate">
          <Link
            href={`/events/${event.id}`}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-neutral-800 hover:bg-neutral-800 text-xs text-neutral-400 hover:text-white transition shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Back to Event</span>
            <span className="sm:hidden">Back</span>
          </Link>

          <div className="h-4 w-px bg-neutral-800 shrink-0" />

          <div className="flex items-center gap-1.5 sm:gap-2 truncate">
            <span className="text-[11px] sm:text-xs font-mono font-bold text-blue-400 px-1.5 sm:px-2 py-0.5 rounded bg-blue-950 border border-blue-800/40 shrink-0">
              {event.event_code}
            </span>
            <span className="text-xs sm:text-sm font-bold text-white tracking-tight truncate max-w-[140px] sm:max-w-sm">
              {event.title}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-950/60 border border-emerald-800 text-[10px] sm:text-[11px] text-emerald-300 font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>ACTIVE</span>
          </div>
        </div>
      </header>

      {/* Main Scanner Container */}
      <main className="flex-1 p-3 sm:p-6 pb-20 max-w-5xl mx-auto w-full">
        <ScannerTerminal
          event={event}
          onAttendanceMarked={() => {
            // Optional: refresh background stats
          }}
        />
      </main>

      {/* Persistent Bottom Operational Status */}
      <footer className="hidden sm:flex h-8 border-t border-neutral-800/60 bg-neutral-950 px-6 items-center justify-between text-[11px] text-neutral-500 font-mono">
        <div className="flex items-center gap-2">
          <span>USB Keyboard Emulation: ENABLED</span>
          <span>•</span>
          <span>Enter Key Auto-Dispatch: ACTIVE</span>
        </div>
        <div>
          Operator: <span className="text-neutral-400">{user?.name}</span> ({user?.role})
        </div>
      </footer>
    </div>
  );
}
