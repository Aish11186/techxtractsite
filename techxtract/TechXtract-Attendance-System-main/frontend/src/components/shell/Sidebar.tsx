'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import {
  LayoutDashboard,
  CalendarDays,
  ScanBarcode,
  Users,
  FileSpreadsheet,
  ShieldCheck,
  LogOut,
  ChevronRight,
  Menu,
  X,
} from 'lucide-react';

interface SidebarProps {
  currentEventId?: number;
}

export function Sidebar({ currentEventId }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout, isAdmin } = useAuth();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Close mobile drawer on route navigation
  useEffect(() => {
    setMobileDrawerOpen(false);
  }, [pathname]);

  // Listen for header toggle events
  useEffect(() => {
    const handleToggle = () => setMobileDrawerOpen((prev) => !prev);
    window.addEventListener('toggle-mobile-sidebar', handleToggle);
    return () => window.removeEventListener('toggle-mobile-sidebar', handleToggle);
  }, []);

  const navItems = [
    {
      label: 'Overview',
      href: '/dashboard',
      icon: LayoutDashboard,
    },
    {
      label: 'Events',
      href: '/events',
      icon: CalendarDays,
    },
    {
      label: 'Live Scanner',
      href: currentEventId ? `/events/${currentEventId}/scanner` : '/events',
      icon: ScanBarcode,
      highlight: true,
    },
    {
      label: 'Students',
      href: '/students',
      icon: Users,
    },
    {
      label: 'Reports & CSV',
      href: '/reports',
      icon: FileSpreadsheet,
    },
    {
      label: 'Audit & Hash Chain',
      href: '/audit',
      icon: ShieldCheck,
      adminOnly: false,
    },
  ];

  const sidebarContent = (
    <div className="flex flex-col justify-between h-full">
      <div>
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-neutral-800/80">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-black text-white text-sm shadow-xs">
              TX
            </div>
            <div>
              <div className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
                TechXtract
                <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-blue-950 text-blue-400 border border-blue-800/60">
                  Core
                </span>
              </div>
              <div className="text-[11px] text-neutral-400 font-medium">Event & Attendance</div>
            </div>
          </div>

          {/* Close button for mobile drawer */}
          <button
            type="button"
            onClick={() => setMobileDrawerOpen(false)}
            className="md:hidden p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <div className="px-3 py-4 space-y-1">
          <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
            Operations
          </div>
          {navItems.map((item) => {
            if (item.adminOnly && !isAdmin) return null;
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href !== '/dashboard' && pathname.startsWith(item.href) && !item.highlight);

            return (
              <Link
                key={item.label}
                href={item.href}
                className={`flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium transition ${
                  isActive
                    ? 'bg-neutral-800 text-white font-semibold shadow-xs'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
                } ${item.highlight ? 'text-blue-400 hover:text-blue-300' : ''}`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon
                    className={`w-4 h-4 ${
                      isActive ? 'text-white' : item.highlight ? 'text-blue-400' : 'text-neutral-400'
                    }`}
                  />
                  <span>{item.label}</span>
                </div>
                {isActive && <ChevronRight className="w-3.5 h-3.5 text-neutral-400" />}
              </Link>
            );
          })}
        </div>

        {/* Back to Main Society Website */}
        <div className="px-3 pb-2">
          <a
            href="http://localhost:8000"
            className="flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium text-purple-300 bg-purple-950/40 border border-purple-800/40 hover:bg-purple-900/50 hover:text-white transition"
          >
            <span>← Back to Main Website</span>
          </a>
        </div>
      </div>

      {/* User profile & Logout */}
      <div className="p-3 border-t border-neutral-800/80">
        <div className="p-2.5 rounded-xl bg-neutral-900 border border-neutral-800/60 mb-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-neutral-200 truncate">
              {user?.name || 'Coordinator'}
            </span>
            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-300 uppercase tracking-wider">
              {user?.role?.replace('_', ' ') || 'STAFF'}
            </span>
          </div>
          <div className="text-[11px] text-neutral-400 truncate mt-0.5">{user?.email}</div>
        </div>

        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-neutral-400 hover:text-red-400 hover:bg-red-950/30 transition border border-transparent hover:border-red-900/40 cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <>
      {/* 1. Desktop Persistent Sidebar */}
      <aside className="hidden md:flex md:w-64 border-r border-neutral-800 bg-neutral-950 flex-col justify-between shrink-0 select-none">
        {sidebarContent}
      </aside>

      {/* 2. Mobile Drawer Overlay */}
      {mobileDrawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-xs animate-in fade-in duration-200"
            onClick={() => setMobileDrawerOpen(false)}
          />
          {/* Slide-out Panel */}
          <div className="relative w-72 max-w-[80vw] h-full bg-neutral-950 border-r border-neutral-800 shadow-2xl z-10 animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </div>
        </div>
      )}

      {/* 3. Mobile Fixed Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-neutral-950/95 border-t border-neutral-800/90 backdrop-blur-xl px-2 py-1 flex items-center justify-around shadow-2xl">
        <Link
          href="/dashboard"
          className={`flex flex-col items-center py-1 px-2 rounded-lg text-[10px] font-medium transition ${
            pathname === '/dashboard' ? 'text-blue-400' : 'text-neutral-400 hover:text-white'
          }`}
        >
          <LayoutDashboard className="w-5 h-5 mb-0.5" />
          <span>Home</span>
        </Link>

        <Link
          href="/events"
          className={`flex flex-col items-center py-1 px-2 rounded-lg text-[10px] font-medium transition ${
            pathname.startsWith('/events') && !pathname.includes('/scanner')
              ? 'text-blue-400'
              : 'text-neutral-400 hover:text-white'
          }`}
        >
          <CalendarDays className="w-5 h-5 mb-0.5" />
          <span>Events</span>
        </Link>

        {/* Center Scanner Pill */}
        <Link
          href={currentEventId ? `/events/${currentEventId}/scanner` : '/events'}
          className="flex flex-col items-center -mt-3.5"
        >
          <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/40 border-2 border-neutral-950">
            <ScanBarcode className="w-6 h-6" />
          </div>
          <span className="text-[10px] font-semibold text-blue-400 mt-0.5">Scan</span>
        </Link>

        <Link
          href="/students"
          className={`flex flex-col items-center py-1 px-2 rounded-lg text-[10px] font-medium transition ${
            pathname === '/students' ? 'text-blue-400' : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Users className="w-5 h-5 mb-0.5" />
          <span>Students</span>
        </Link>

        <button
          type="button"
          onClick={() => setMobileDrawerOpen(true)}
          className="flex flex-col items-center py-1 px-2 rounded-lg text-[10px] font-medium text-neutral-400 hover:text-white transition"
        >
          <Menu className="w-5 h-5 mb-0.5" />
          <span>More</span>
        </button>
      </nav>
    </>
  );
}
