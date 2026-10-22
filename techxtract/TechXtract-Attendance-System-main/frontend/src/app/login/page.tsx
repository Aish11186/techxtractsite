'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Shield, KeyRound, ArrowRight, AlertCircle, Sparkles } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await login(email, password);
      window.location.href = '/dashboard';
    } catch (err: any) {
      setError(err.message || 'Invalid email or password');
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickLogin = async (demoEmail: string, demoPass: string) => {
    setEmail(demoEmail);
    setPassword(demoPass);
    setError(null);
    setIsLoading(true);
    try {
      await login(demoEmail, demoPass);
      window.location.href = '/dashboard';
    } catch (err: any) {
      setError(err.message || 'Login failed');
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 flex flex-col justify-center items-center px-4">
      <div className="w-full max-w-md space-y-6">
        {/* Brand header */}
        <div className="text-center space-y-2">
          <div className="inline-flex w-12 h-12 rounded-xl bg-blue-600 items-center justify-center font-black text-white text-lg shadow-lg shadow-blue-900/30">
            TX
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">
            TechX Attendance Management System
          </h1>
          <p className="text-xs text-neutral-400">
            Official Technical Society Event & Attendance Portal
          </p>
        </div>

        {/* Login form card */}
        <div className="rounded-2xl border border-neutral-800 bg-neutral-900/90 p-8 shadow-2xl space-y-6">
          {error && (
            <div className="p-3.5 rounded-xl bg-red-950/60 border border-red-800/80 text-red-200 text-xs flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1.5">
                Institutional Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@techxtract.edu"
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1.5">
                Password
              </label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-sm text-white placeholder-neutral-500 focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-sm font-semibold transition shadow-md disabled:opacity-50 cursor-pointer"
            >
              <span>{isLoading ? 'Signing In...' : 'Sign In to Terminal'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Quick Demo Fill Buttons for Evaluators */}
          <div className="pt-4 border-t border-neutral-800 space-y-2.5">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              Quick 1-Tap Sign In
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                disabled={isLoading}
                onClick={() => handleQuickLogin('admin@techxtract.edu', 'Admin@12345')}
                className="p-3 rounded-xl border border-neutral-800 bg-neutral-950 hover:bg-neutral-800 active:scale-98 text-left transition group cursor-pointer disabled:opacity-50"
              >
                <div className="text-xs font-semibold text-white group-hover:text-blue-400">Super Admin</div>
                <div className="text-[10px] text-neutral-400 font-mono mt-0.5 truncate">Tap to Sign In</div>
              </button>

              <button
                type="button"
                disabled={isLoading}
                onClick={() => handleQuickLogin('coordinator@techxtract.edu', 'Coord@12345')}
                className="p-3 rounded-xl border border-neutral-800 bg-neutral-950 hover:bg-neutral-800 active:scale-98 text-left transition group cursor-pointer disabled:opacity-50"
              >
                <div className="text-xs font-semibold text-white group-hover:text-blue-400">Coordinator</div>
                <div className="text-[10px] text-neutral-400 font-mono mt-0.5 truncate">Tap to Sign In</div>
              </button>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="text-center text-[11px] text-neutral-500 font-mono">
          SHA-256 Audit Log Chained • Code 128 / QR Ready • PostgreSQL / Supabase
        </div>
      </div>
    </div>
  );
}
