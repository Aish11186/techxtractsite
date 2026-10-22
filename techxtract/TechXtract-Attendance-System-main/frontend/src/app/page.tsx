'use client';

import { useEffect } from 'react';
import { useAuth } from '@/lib/auth-context';

export default function HomePage() {
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading) {
      if (user) {
        window.location.replace('/dashboard');
      } else {
        window.location.replace('/login');
      }
    }
  }, [user, isLoading]);

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center font-sans text-xs text-neutral-400 gap-3 p-4 text-center">
      <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      <p className="text-neutral-200 text-sm font-medium">Opening TechX Attendance System...</p>
      <div className="flex items-center gap-3 pt-3">
        <a
          href="/login"
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-500 shadow-md transition"
        >
          Continue to Login
        </a>
        <a
          href="/dashboard"
          className="px-4 py-2 rounded-lg border border-neutral-700 text-neutral-300 text-xs hover:bg-neutral-800 transition"
        >
          Dashboard
        </a>
      </div>
    </div>
  );
}
