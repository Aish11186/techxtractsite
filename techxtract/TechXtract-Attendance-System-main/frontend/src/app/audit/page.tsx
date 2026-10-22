'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { Sidebar } from '@/components/shell/Sidebar';
import { Header } from '@/components/shell/Header';
import { AuditLog, AuditVerifyResult } from '@/types';
import {
  ShieldCheck,
  ShieldAlert,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  Lock,
  ArrowRight,
  Code2,
} from 'lucide-react';

export default function AuditPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();

  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [verifyResult, setVerifyResult] = useState<AuditVerifyResult | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMetaLog, setSelectedMetaLog] = useState<AuditLog | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }
    if (user) {
      loadAuditData();
    }
  }, [user, authLoading]);

  const loadAuditData = async () => {
    setIsLoading(true);
    try {
      const data = await api.getAuditLogs({ limit: 100 });
      setLogs(data);
      // Auto-run verification on page load
      const v = await api.verifyAuditChain();
      setVerifyResult(v);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRunVerification = async () => {
    setIsVerifying(true);
    try {
      const v = await api.verifyAuditChain();
      setVerifyResult(v);
    } catch (err: any) {
      alert(err.message || 'Audit verification failed');
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="flex h-screen bg-neutral-950 text-neutral-100 overflow-hidden font-sans">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <Header
          title="Cryptographic Audit Log & Immutability Verification"
          subtitle="Append-only audit trail protected with sequential SHA-256 hash chaining"
          actionButton={
            <button
              onClick={handleRunVerification}
              disabled={isVerifying}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition cursor-pointer disabled:opacity-50 shadow-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isVerifying ? 'animate-spin' : ''}`} />
              <span>{isVerifying ? 'Walking Chain...' : 'Verify Chain Integrity'}</span>
            </button>
          }
        />

        <main className="p-3.5 sm:p-6 pb-24 md:pb-8 space-y-6 max-w-7xl">
          {/* Verification Status Hero Banner */}
          {verifyResult ? (
            <div
              className={`rounded-2xl border p-5 transition ${
                verifyResult.verified
                  ? 'bg-emerald-950/30 border-emerald-800/80 text-emerald-100'
                  : 'bg-red-950/30 border-red-800/80 text-red-100'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3.5">
                  <div
                    className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${
                      verifyResult.verified ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                    }`}
                  >
                    {verifyResult.verified ? (
                      <ShieldCheck className="w-6 h-6" />
                    ) : (
                      <ShieldAlert className="w-6 h-6" />
                    )}
                  </div>
                  <div>
                    <div className="text-base font-bold tracking-tight">
                      {verifyResult.verified
                        ? 'Audit Integrity Cryptographically Verified'
                        : 'Tamper Alert: Hash Chain Inconsistency Detected!'}
                    </div>
                    <p className="text-xs opacity-90 mt-1">{verifyResult.message}</p>
                    <div className="flex items-center gap-4 text-[11px] font-mono mt-3 opacity-75">
                      <span>Total Chain Length: {verifyResult.total_records} records</span>
                      <span>•</span>
                      <span>Algorithm: SHA-256 Chained</span>
                      <span>•</span>
                      <span>Genesis: 00000000...0000</span>
                    </div>
                  </div>
                </div>

                <div className="hidden sm:block text-right">
                  <span
                    className={`inline-block px-2.5 py-1 rounded-full text-xs font-bold font-mono uppercase tracking-wider ${
                      verifyResult.verified
                        ? 'bg-emerald-900/60 text-emerald-300 border border-emerald-700/60'
                        : 'bg-red-900/60 text-red-300 border border-red-700/60'
                    }`}
                  >
                    {verifyResult.verified ? 'CHAIN PRISTINE' : 'CORRUPTED'}
                  </span>
                </div>
              </div>
            </div>
          ) : null}

          {/* Audit Chain Log Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
                Immutable Sequential Audit Records ({logs.length})
              </h2>
              <span className="text-[11px] text-neutral-500 font-mono">
                Append-only history
              </span>
            </div>

            <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 overflow-x-auto shadow-xs">
              <table className="w-full min-w-[640px] text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-neutral-800 bg-neutral-950/80 text-[10px] uppercase text-neutral-400 font-semibold tracking-wider font-sans">
                    <th className="py-3 px-4"># ID</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Timestamp (UTC)</th>
                    <th className="py-3 px-4">Actor</th>
                    <th className="py-3 px-4">Previous Hash</th>
                    <th className="py-3 px-4">Record SHA-256 Hash</th>
                    <th className="py-3 px-4 text-right">Payload</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-neutral-800/30 transition">
                      <td className="py-3 px-4 font-bold text-neutral-300">#{log.id}</td>
                      <td className="py-3 px-4 font-sans">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            log.action === 'SCAN_RECORDED'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800/50'
                              : log.action === 'CORRECTION'
                              ? 'bg-amber-950 text-amber-400 border border-amber-800/50'
                              : 'bg-blue-950 text-blue-400 border border-blue-800/50'
                          }`}
                        >
                          {log.action}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-neutral-400 text-[11px]">
                        {new Date(log.timestamp).toLocaleString()}
                      </td>
                      <td className="py-3 px-4 font-sans text-white text-xs">
                        {log.performed_by_name || 'System'}
                      </td>
                      <td className="py-3 px-4 text-neutral-500 text-[11px]">
                        <span title={log.previous_hash} className="cursor-help">
                          {log.previous_hash.substring(0, 10)}...{log.previous_hash.substring(58)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-blue-400 text-[11px]">
                        <span title={log.record_hash} className="cursor-help font-semibold">
                          {log.record_hash.substring(0, 10)}...{log.record_hash.substring(58)}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-sans">
                        <button
                          onClick={() => setSelectedMetaLog(log)}
                          className="text-xs text-blue-400 hover:text-blue-300 font-medium inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Code2 className="w-3.5 h-3.5" />
                          <span>View</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                  {logs.length === 0 && !isLoading && (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-xs text-neutral-500 font-sans">
                        Audit log is currently empty.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      </div>

      {/* Canonical Metadata Viewer Modal */}
      {selectedMetaLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl text-neutral-100">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Lock className="w-4 h-4 text-emerald-400" />
                Audit Record #{selectedMetaLog.id} Payload
              </h3>
              <button
                onClick={() => setSelectedMetaLog(null)}
                className="text-neutral-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="py-4 space-y-3 text-xs font-mono">
              <div>
                <span className="text-neutral-500 uppercase text-[10px] block">Action:</span>
                <span className="text-emerald-400 font-bold">{selectedMetaLog.action}</span>
              </div>
              <div>
                <span className="text-neutral-500 uppercase text-[10px] block">SHA-256 Record Hash:</span>
                <span className="text-blue-400 break-all">{selectedMetaLog.record_hash}</span>
              </div>
              <div>
                <span className="text-neutral-500 uppercase text-[10px] block">Previous Record Hash:</span>
                <span className="text-neutral-400 break-all">{selectedMetaLog.previous_hash}</span>
              </div>
              <div>
                <span className="text-neutral-500 uppercase text-[10px] block">Canonical Metadata JSON:</span>
                <pre className="p-3 rounded-lg bg-neutral-950 border border-neutral-800 overflow-x-auto text-neutral-200 mt-1 whitespace-pre-wrap">
                  {JSON.stringify(JSON.parse(selectedMetaLog.metadata_json), null, 2)}
                </pre>
              </div>
            </div>

            <div className="pt-3 border-t border-neutral-800 flex justify-end">
              <button
                onClick={() => setSelectedMetaLog(null)}
                className="px-4 py-1.5 rounded-lg bg-neutral-800 text-xs text-white hover:bg-neutral-700"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
