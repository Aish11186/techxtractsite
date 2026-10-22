'use client';

import React, { useState } from 'react';
import { AttendanceRecord } from '@/types';
import { api } from '@/lib/api';
import { AlertCircle, Check, X } from 'lucide-react';

interface CorrectionModalProps {
  record: AttendanceRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function CorrectionModal({ record, isOpen, onClose, onSuccess }: CorrectionModalProps) {
  const statusOptions = record
    ? ['PRESENT', 'LATE', 'EXCUSED', 'ABSENT'].filter((s) => s !== record.status)
    : ['PRESENT', 'LATE', 'EXCUSED', 'ABSENT'];

  const [newStatus, setNewStatus] = useState<string>(statusOptions[0] || 'EXCUSED');
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when the record changes (different attendance record selected)
  React.useEffect(() => {
    if (record) {
      const options = ['PRESENT', 'LATE', 'EXCUSED', 'ABSENT'].filter((s) => s !== record.status);
      setNewStatus(options[0] || 'EXCUSED');
      setReason('');
      setError(null);
    }
  }, [record?.id, record?.status]);

  if (!isOpen || !record) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim() || reason.trim().length < 3) {
      setError('A descriptive reason (min 3 characters) is mandatory for the audit log.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await api.correctAttendance(record.id, {
        new_status: newStatus,
        reason: reason.trim(),
      });
      onSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to apply attendance correction');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="w-full max-w-lg rounded-xl border border-neutral-800 bg-neutral-900 shadow-2xl p-6 text-neutral-100">
        <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
          <div>
            <h3 className="text-lg font-semibold text-white">Controlled Attendance Correction</h3>
            <p className="text-xs text-neutral-400 mt-0.5">
              Updates operational status while appending an immutable entry to the SHA-256 audit chain.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="my-4 p-3.5 rounded-lg bg-neutral-950/80 border border-neutral-800 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-neutral-400">Student:</span>
            <span className="font-medium text-white">{record.student?.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-400">Enrollment No:</span>
            <span className="font-mono text-neutral-300">{record.student?.enrollment_no}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-400">Current Status:</span>
            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-neutral-800 text-neutral-200">
              {record.status}
            </span>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-950/50 border border-red-800/80 text-red-200 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
              New Status <span className="text-red-400">*</span>
            </label>
            <select
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              {statusOptions.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-300 mb-1.5">
              Correction Reason (Mandatory Audit Explanation) <span className="text-red-400">*</span>
            </label>
            <textarea
              rows={3}
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Scanned wrong desk, coordinator verified manual presence"
              className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-hidden focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-lg border border-neutral-700 text-sm font-medium text-neutral-300 hover:bg-neutral-800 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition shadow-xs disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              {isSubmitting ? 'Recording Correction...' : 'Commit Correction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
