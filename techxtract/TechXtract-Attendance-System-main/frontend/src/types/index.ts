export type UserRole = 'SUPER_ADMIN' | 'COORDINATOR' | 'STUDENT';

export interface User {
  id: number;
  email: string;
  name: string;
  role: UserRole;
  status: string;
  created_at: string;
}

export interface Student {
  id: number;
  enrollment_no: string;
  name: string;
  email?: string | null;
  department: string;
  year: string;
  section?: string | null;
  barcode_value?: string | null;
  qr_token: string;
  barcode_image_filename?: string | null;
  status: string;
  created_at: string;
}

export type EventStatus = 'DRAFT' | 'SCHEDULED' | 'OPEN' | 'CLOSED' | 'CANCELLED' | 'ARCHIVED';

export interface EventItem {
  id: number;
  event_code: string;
  title: string;
  description?: string | null;
  type: string;
  venue: string;
  start_datetime: string;
  end_datetime: string;
  registration_required: boolean;
  attendance_required: boolean;
  late_threshold_minutes: number;
  status: EventStatus;
  created_by_id: number;
  created_at: string;
  total_registered?: number;
  total_present?: number;
  total_late?: number;
}

export interface EventRegistration {
  id: number;
  event_id: number;
  student_id: number;
  registered_at: string;
  status: string;
  student?: Student;
}

export interface AttendanceRecord {
  id: number;
  event_id: number;
  student_id: number;
  status: 'PRESENT' | 'LATE' | 'EXCUSED' | 'ABSENT';
  marked_at: string;
  marked_by_id: number;
  scan_method: string;
  device_id?: string | null;
  created_at: string;
  student?: {
    id: number;
    name: string;
    enrollment_no: string;
    department: string;
    year: string;
    barcode_value?: string | null;
  };
}

export interface ScanResponse {
  status: 'SUCCESS' | 'DUPLICATE' | 'UNREGISTERED' | 'INVALID_IDENTIFIER' | 'EVENT_CLOSED' | 'UNAUTHORIZED' | 'SERVER_ERROR';
  message: string;
  student?: {
    id: number;
    name: string;
    enrollment_no: string;
    department: string;
    year: string;
    barcode_value?: string | null;
  };
  attendance_status?: string;
  marked_at?: string;
  scan_id?: number;
  event_stats?: {
    present: number;
    registered: number;
  };
}

export interface AuditLog {
  id: number;
  attendance_id?: number | null;
  event_id: number;
  student_id: number;
  action: string;
  timestamp: string;
  performed_by_name?: string | null;
  metadata_json: string;
  previous_hash: string;
  record_hash: string;
}

export interface AuditVerifyResult {
  verified: boolean;
  total_records: number;
  message: string;
  broken_record_id?: number | null;
  checked_records?: number | null;
  reason?: string | null;
}

export interface EventReportData {
  event_id: number;
  event_code: string;
  title: string;
  status: string;
  venue: string;
  start_datetime: string;
  total_registered: number;
  total_present: number;
  total_late: number;
  total_excused: number;
  total_absent: number;
  attendance_percentage: number;
}

export interface SocietyReportData {
  total_students: number;
  total_events: number;
  total_attendance_volume: number;
  average_attendance_percentage: number;
  active_events_count: number;
}
