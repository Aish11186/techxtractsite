'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { api } from '@/lib/api';
import { Sidebar } from '@/components/shell/Sidebar';
import { Header } from '@/components/shell/Header';
import { Student } from '@/types';
import {
  Users,
  Search,
  Filter,
  Upload,
  Plus,
  Eye,
  Edit2,
  CheckCircle2,
  Clock,
  Calendar,
  X,
  AlertCircle,
  FileSpreadsheet,
} from 'lucide-react';

export default function StudentsPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAdmin, isCoordinator } = useAuth();

  const [students, setStudents] = useState<Student[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [search, setSearch] = useState('');
  const [selectedDept, setSelectedDept] = useState('');
  const [selectedYear, setSelectedYear] = useState('');
  const [departments, setDepartments] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Student Detail Modal state
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [studentHistory, setStudentHistory] = useState<any[]>([]);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // CSV Import Modal state
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importReport, setImportReport] = useState<any>(null);
  const [isImporting, setIsImporting] = useState(false);

  // Create Student Modal state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [createEnrollment, setCreateEnrollment] = useState('');
  const [createName, setCreateName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createDept, setCreateDept] = useState('Technical Team');
  const [createYear, setCreateYear] = useState('3rd Year');
  const [createBarcode, setCreateBarcode] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }
    if (user) {
      loadDepartments();
      loadStudents();
    }
  }, [user, authLoading, page, selectedDept, selectedYear]);

  const loadDepartments = async () => {
    try {
      const depts = await api.getDepartments();
      setDepartments(depts);
    } catch (err) {
      console.error(err);
    }
  };

  const loadStudents = async () => {
    setIsLoading(true);
    try {
      const data = await api.getStudents({
        search: search.trim() || undefined,
        department: selectedDept || undefined,
        year: selectedYear || undefined,
        page,
        limit,
      });
      setStudents(data.items);
      setTotal(data.total);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadStudents();
  };

  const handleOpenDetail = async (studentId: number) => {
    setIsDetailModalOpen(true);
    try {
      const data = await api.getStudent(studentId);
      setSelectedStudent(data.student);
      setStudentHistory(data.attendance_history);
    } catch (err) {
      console.error(err);
    }
  };

  const handleImportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!importFile) return;
    setIsImporting(true);
    setImportReport(null);
    try {
      const res = await api.importStudentsCsv(importFile);
      setImportReport(res);
      await loadStudents();
    } catch (err: any) {
      alert(err.message || 'CSV Import failed');
    } finally {
      setIsImporting(false);
    }
  };

  const handleCreateStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    try {
      await api.createStudent({
        enrollment_no: createEnrollment.trim(),
        name: createName.trim(),
        email: createEmail.trim() || undefined,
        department: createDept,
        year: createYear,
        barcode_value: createBarcode.trim() || undefined,
        status: 'ACTIVE',
      });
      setIsCreateModalOpen(false);
      setCreateEnrollment('');
      setCreateName('');
      setCreateEmail('');
      setCreateBarcode('');
      await loadStudents();
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create student');
    }
  };

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="flex h-screen bg-neutral-950 text-neutral-100 overflow-hidden font-sans">
      <Sidebar />

      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <Header
          title="Student Registry & Identity Records"
          subtitle="Manage student enrollment master data, barcodes, QR tokens, and attendance histories"
          actionButton={
            isCoordinator && (
              <div className="flex items-center gap-2">
                {isAdmin && (
                  <button
                    onClick={() => setIsImportModalOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-xs text-neutral-200 transition"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span>Import CSV</span>
                  </button>
                )}
                <button
                  onClick={() => setIsCreateModalOpen(true)}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Student</span>
                </button>
              </div>
            )
          }
        />

        <main className="p-3.5 sm:p-6 space-y-6 max-w-7xl pb-24 md:pb-8">
          {/* Search & Filter Toolbar */}
          <div className="p-4 rounded-xl border border-neutral-800 bg-neutral-900/60 flex flex-col sm:flex-row gap-3 items-center justify-between">
            <form onSubmit={handleSearchSubmit} className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, enrollment, barcode..."
                className="w-full rounded-lg border border-neutral-700 bg-neutral-950 pl-9 pr-3 py-1.5 text-xs text-white placeholder-neutral-500 focus:outline-hidden focus:border-blue-500"
              />
            </form>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <select
                value={selectedDept}
                onChange={(e) => {
                  setSelectedDept(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-xs text-neutral-200 focus:outline-hidden focus:border-blue-500"
              >
                <option value="">All Departments / Teams</option>
                {departments.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>

              <select
                value={selectedYear}
                onChange={(e) => {
                  setSelectedYear(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-1.5 text-xs text-neutral-200 focus:outline-hidden focus:border-blue-500"
              >
                <option value="">All Years</option>
                <option value="1st Year">1st Year</option>
                <option value="2nd Year">2nd Year</option>
                <option value="3rd Year">3rd Year</option>
                <option value="4th Year">4th Year</option>
              </select>

              {(search || selectedDept || selectedYear) && (
                <button
                  onClick={() => {
                    setSearch('');
                    setSelectedDept('');
                    setSelectedYear('');
                    setPage(1);
                  }}
                  className="px-2.5 py-1.5 rounded-lg border border-neutral-800 text-[11px] text-neutral-400 hover:text-white hover:bg-neutral-800 transition"
                >
                  Reset
                </button>
              )}
            </div>
          </div>

          {/* Practical Dense Administrative Table */}
          <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 overflow-hidden shadow-xs">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-neutral-800 bg-neutral-950/80 text-[10px] uppercase text-neutral-400 font-semibold tracking-wider">
                  <th className="py-3 px-4">Enrollment No</th>
                  <th className="py-3 px-4">Full Name</th>
                  <th className="py-3 px-4">Department / Society Team</th>
                  <th className="py-3 px-4">Year</th>
                  <th className="py-3 px-4">Barcode Encoded Identifier</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60 font-mono">
                {students.map((st) => (
                  <tr key={st.id} className="hover:bg-neutral-800/30 transition">
                    <td className="py-3 px-4 font-bold text-neutral-200">{st.enrollment_no}</td>
                    <td className="py-3 px-4 font-sans font-medium text-white">{st.name}</td>
                    <td className="py-3 px-4 font-sans text-neutral-400">{st.department}</td>
                    <td className="py-3 px-4 font-sans text-neutral-400">{st.year}</td>
                    <td className="py-3 px-4 text-blue-400 text-[11px] truncate max-w-[200px]">
                      {st.barcode_value || '—'}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-950/80 text-emerald-400 border border-emerald-800/60 font-sans">
                        {st.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-sans">
                      <button
                        onClick={() => handleOpenDetail(st.id)}
                        className="text-xs text-blue-400 hover:text-blue-300 font-medium inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Inspect</span>
                      </button>
                    </td>
                  </tr>
                ))}
                {students.length === 0 && !isLoading && (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-xs text-neutral-500 font-sans">
                      No students found matching current query.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            {/* Pagination Controls */}
            <div className="p-3 border-t border-neutral-800 bg-neutral-950/60 flex items-center justify-between text-xs text-neutral-400 font-mono">
              <div>
                Showing {(page - 1) * limit + 1}–{Math.min(page * limit, total)} of {total} records
              </div>
              <div className="flex items-center gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => setPage((p) => p - 1)}
                  className="px-2.5 py-1 rounded border border-neutral-800 disabled:opacity-40 hover:bg-neutral-900 transition"
                >
                  Prev
                </button>
                <span className="px-2">
                  {page} / {totalPages}
                </span>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="px-2.5 py-1 rounded border border-neutral-800 disabled:opacity-40 hover:bg-neutral-900 transition"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </main>
      </div>

      {/* Student Inspect Detail Modal */}
      {isDetailModalOpen && selectedStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-2xl rounded-2xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl text-neutral-100 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
              <div>
                <h3 className="text-lg font-bold text-white">{selectedStudent.name}</h3>
                <p className="text-xs text-neutral-400 font-mono mt-0.5">
                  Enrollment #{selectedStudent.enrollment_no} • {selectedStudent.department}
                </p>
              </div>
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="p-1 rounded-lg text-neutral-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 space-y-5">
              {/* Profile Details */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 rounded-xl bg-neutral-950 border border-neutral-800 text-xs">
                <div>
                  <span className="text-[10px] text-neutral-500 uppercase font-semibold">Email</span>
                  <div className="text-neutral-200 mt-0.5 truncate">{selectedStudent.email || '—'}</div>
                </div>
                <div>
                  <span className="text-[10px] text-neutral-500 uppercase font-semibold">Year & Section</span>
                  <div className="text-neutral-200 mt-0.5">{selectedStudent.year} (Sec {selectedStudent.section || 'A'})</div>
                </div>
                <div>
                  <span className="text-[10px] text-neutral-500 uppercase font-semibold">Account Status</span>
                  <div className="text-emerald-400 font-bold mt-0.5">{selectedStudent.status}</div>
                </div>
                <div>
                  <span className="text-[10px] text-neutral-500 uppercase font-semibold">Barcode Scanned String</span>
                  <div className="text-blue-400 font-mono mt-0.5 truncate">{selectedStudent.barcode_value || 'None'}</div>
                </div>
                <div>
                  <span className="text-[10px] text-neutral-500 uppercase font-semibold">Opaque QR Token</span>
                  <div className="text-neutral-400 font-mono mt-0.5 truncate">{selectedStudent.qr_token}</div>
                </div>
                <div>
                  <span className="text-[10px] text-neutral-500 uppercase font-semibold">Barcode File</span>
                  <div className="text-neutral-400 font-mono mt-0.5 truncate">{selectedStudent.barcode_image_filename || '—'}</div>
                </div>
              </div>

              {/* Barcode Asset Visual Preview */}
              {selectedStudent.barcode_image_filename && (
                <div className="p-4 rounded-xl bg-neutral-950 border border-neutral-800 flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div>
                    <span className="text-[10px] text-neutral-500 uppercase font-semibold">Associated Code 128 Asset</span>
                    <div className="text-xs text-neutral-200 font-mono mt-0.5">
                      {selectedStudent.barcode_image_filename}
                    </div>
                    <div className="text-[11px] text-neutral-500 mt-1">
                      Symbology: Code 128 • Encoded: <code className="text-blue-400 font-mono">{selectedStudent.barcode_value}</code>
                    </div>
                  </div>
                  <div className="bg-white p-2.5 rounded-lg border border-neutral-300 shrink-0 shadow-xs">
                    <img
                      src={`http://localhost:8000/static/barcodes/${encodeURIComponent(selectedStudent.barcode_image_filename)}`}
                      alt={`Barcode for ${selectedStudent.name}`}
                      className="h-12 object-contain"
                    />
                  </div>
                </div>
              )}

              {/* Attendance History Section */}
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-neutral-300">
                  Verified Attendance History ({studentHistory.length} events)
                </h4>

                {studentHistory.length === 0 ? (
                  <div className="p-6 text-center text-xs text-neutral-500 border border-dashed border-neutral-800 rounded-lg">
                    No event attendance records yet for this student.
                  </div>
                ) : (
                  <div className="rounded-lg border border-neutral-800 overflow-hidden">
                    <table className="w-full text-left text-xs font-mono">
                      <thead className="bg-neutral-950 text-[10px] uppercase text-neutral-500">
                        <tr>
                          <th className="py-2.5 px-3">Event Code</th>
                          <th className="py-2.5 px-3">Event Title</th>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-3">Marked At</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-800">
                        {studentHistory.map((h, i) => (
                          <tr key={i} className="hover:bg-neutral-800/40">
                            <td className="py-2.5 px-3 text-blue-400 font-semibold">{h.event_code}</td>
                            <td className="py-2.5 px-3 font-sans text-white">{h.event_title}</td>
                            <td className="py-2.5 px-3">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  h.status === 'PRESENT'
                                    ? 'bg-emerald-950 text-emerald-400'
                                    : 'bg-amber-950 text-amber-400'
                                }`}
                              >
                                {h.status}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-neutral-400">
                              {new Date(h.marked_at).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            <div className="pt-3 border-t border-neutral-800 flex justify-end">
              <button
                onClick={() => setIsDetailModalOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-neutral-100 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <h3 className="text-base font-bold text-white">Import Students from CSV</h3>
              <button onClick={() => setIsImportModalOpen(false)} className="text-neutral-400 hover:text-white">
                ✕
              </button>
            </div>

            <form onSubmit={handleImportSubmit} className="py-4 space-y-4">
              <div className="text-xs text-neutral-400">
                Expected CSV header: <code className="text-blue-400 font-mono">enrollment_no, name, email, department, year, section, barcode_value</code>
              </div>

              <div className="p-6 rounded-xl border-2 border-dashed border-neutral-700 text-center hover:border-blue-500 transition cursor-pointer">
                <input
                  type="file"
                  accept=".csv"
                  required
                  onChange={(e) => setImportFile(e.target.files?.[0] || null)}
                  className="w-full text-xs text-neutral-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-500"
                />
              </div>

              {importReport && (
                <div className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800 space-y-1 text-xs font-mono">
                  <div className="text-white font-bold">Import Summary:</div>
                  <div className="text-emerald-400">✓ Added: {importReport.successfully_added}</div>
                  <div className="text-amber-400">⚠️ Skipped Duplicates: {importReport.skipped_duplicates}</div>
                  <div className="text-red-400">✕ Errors: {importReport.errors_count}</div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsImportModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-neutral-700 text-xs text-neutral-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!importFile || isImporting}
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold disabled:opacity-50"
                >
                  {isImporting ? 'Processing CSV...' : 'Start Import'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Student Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-neutral-100 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <h3 className="text-base font-bold text-white">Create Student Master Record</h3>
              <button onClick={() => setIsCreateModalOpen(false)} className="text-neutral-400 hover:text-white">
                ✕
              </button>
            </div>

            {createError && (
              <div className="my-3 p-3 rounded-lg bg-red-950/60 border border-red-800 text-red-200 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                <span>{createError}</span>
              </div>
            )}

            <form onSubmit={handleCreateStudent} className="py-4 space-y-3 text-xs">
              <div>
                <label className="block text-neutral-400 mb-1">
                  Enrollment Number <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={createEnrollment}
                  onChange={(e) => setCreateEnrollment(e.target.value)}
                  placeholder="e.g. 14114812725"
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-white font-mono"
                />
              </div>

              <div>
                <label className="block text-neutral-400 mb-1">
                  Student Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  placeholder="e.g. Rishu Singh"
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-white"
                />
              </div>

              <div>
                <label className="block text-neutral-400 mb-1">Email</label>
                <input
                  type="email"
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  placeholder="e.g. rishu@college.edu"
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-neutral-400 mb-1">Department</label>
                  <select
                    value={createDept}
                    onChange={(e) => setCreateDept(e.target.value)}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-white"
                  >
                    <option value="Technical Team">Technical Team</option>
                    <option value="Graphics Team">Graphics Team</option>
                    <option value="Operations Team">Operations Team</option>
                    <option value="PR Team">PR Team</option>
                    <option value="Social Media Team">Social Media Team</option>
                    <option value="Executive Board">Executive Board</option>
                  </select>
                </div>
                <div>
                  <label className="block text-neutral-400 mb-1">Year</label>
                  <select
                    value={createYear}
                    onChange={(e) => setCreateYear(e.target.value)}
                    className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-white"
                  >
                    <option value="1st Year">1st Year</option>
                    <option value="2nd Year">2nd Year</option>
                    <option value="3rd Year">3rd Year</option>
                    <option value="4th Year">4th Year</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-neutral-400 mb-1">Barcode Encoded Identifier (Optional)</label>
                <input
                  type="text"
                  value={createBarcode}
                  onChange={(e) => setCreateBarcode(e.target.value)}
                  placeholder="e.g. TXT_TH_01_Rishu"
                  className="w-full rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-white font-mono"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-3 py-1.5 rounded-lg border border-neutral-700 text-xs text-neutral-300"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
                >
                  Save Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
