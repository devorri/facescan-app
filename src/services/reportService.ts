import { supabase } from '../lib/supabase';
import type { Laboratory, Profile, Schedule } from '../types/database';

export type ReportFilter = {
  dateFrom: Date;
  dateTo: Date;
  laboratoryId?: string; // 'all' or specific id
  facultyId?: string;    // 'all' or specific id
  statusFilter?: 'all' | 'granted' | 'denied' | 'late' | 'exited';
};

export type AccessReportItem = {
  id: string;
  facultyId: string | null;
  facultyName: string;
  facultyRole: string;
  laboratoryId: string | null;
  laboratoryName: string;
  laboratoryLocation: string | null;
  decision: 'granted' | 'denied';
  reason: string | null;
  createdAt: string;
  exitedAt: string | null;
  entryDateFormatted: string;
  entryTimeFormatted: string;
  exitTimeFormatted: string;
  isLate: boolean;
  minutesLate: number;
  matchedSchedule: {
    startTime: string;
    endTime: string;
    dayOfWeek: string;
  } | null;
  displayStatus: 'Granted' | 'Denied' | 'Late' | 'Exited';
  statusBadgeColor: string;
  statusBadgeBg: string;
  remarks: string;
};

export type ReportSummary = {
  totalLogs: number;
  totalGranted: number;
  totalDenied: number;
  totalLate: number;
  totalExited: number;
  uniqueFacultyCount: number;
};

export type ReportResult = {
  items: AccessReportItem[];
  summary: ReportSummary;
  generatedAt: string;
  filters: ReportFilter;
  filterLabels: {
    dateRangeText: string;
    laboratoryName: string;
    facultyName: string;
    statusText: string;
  };
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const LATE_GRACE_PERIOD_MINUTES = 15;

function timeStrToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function formatTimeDisplay(date: Date): string {
  return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
}

function formatDateDisplay(date: Date): string {
  return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatScheduleTime(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return timeStr;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

/**
 * Fetches all necessary data and computes faculty access metrics including:
 * - Granted vs Denied
 * - 15-minute grace period lateness calculation
 * - Exit timestamps (if recorded or column present)
 */
export async function getAccessReportData(filters: ReportFilter): Promise<ReportResult> {
  const startIso = new Date(filters.dateFrom);
  startIso.setHours(0, 0, 0, 0);

  const endIso = new Date(filters.dateTo);
  endIso.setHours(23, 59, 59, 999);

  // 1. Fetch access logs. Gracefully support DBs where exited_at column may or may not exist yet.
  let logsData: any[] = [];
  try {
    const { data, error } = await supabase
      .from('access_logs')
      .select(
        `
          id,
          faculty_id,
          laboratory_id,
          decision,
          reason,
          created_at,
          exited_at,
          profiles:faculty_id(id, name, role),
          laboratories:laboratory_id(id, name, location)
        `,
      )
      .gte('created_at', startIso.toISOString())
      .lte('created_at', endIso.toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      // If column exited_at does not exist yet (code 42703), retry without it
      if (error.code === '42703' || error.message?.includes('exited_at')) {
        const fallback = await supabase
          .from('access_logs')
          .select(
            `
              id,
              faculty_id,
              laboratory_id,
              decision,
              reason,
              created_at,
              profiles:faculty_id(id, name, role),
              laboratories:laboratory_id(id, name, location)
            `,
          )
          .gte('created_at', startIso.toISOString())
          .lte('created_at', endIso.toISOString())
          .order('created_at', { ascending: false });

        if (fallback.error) throw fallback.error;
        logsData = fallback.data ?? [];
      } else {
        throw error;
      }
    } else {
      logsData = data ?? [];
    }
  } catch (err: any) {
    if (err?.code === '42703' || err?.message?.includes('exited_at')) {
      const fallback = await supabase
        .from('access_logs')
        .select(
          `
            id,
            faculty_id,
            laboratory_id,
            decision,
            reason,
            created_at,
            profiles:faculty_id(id, name, role),
            laboratories:laboratory_id(id, name, location)
          `,
        )
        .gte('created_at', startIso.toISOString())
        .lte('created_at', endIso.toISOString())
        .order('created_at', { ascending: false });

      if (fallback.error) throw fallback.error;
      logsData = fallback.data ?? [];
    } else {
      throw err;
    }
  }

  // 2. Fetch all schedules to correlate entry times with designated teaching periods
  const { data: schedulesData, error: schedError } = await supabase
    .from('schedules')
    .select('id, faculty_id, laboratory_id, day_of_week, start_time, end_time');

  if (schedError) {
    console.warn('Failed to load schedules for late comparison:', schedError.message);
  }

  const allSchedules: Schedule[] = (schedulesData ?? []) as Schedule[];

  // 3. Process each log entry
  const rawItems: AccessReportItem[] = logsData.map((log) => {
    const entryDate = new Date(log.created_at);
    const dayOfWeekName = DAY_NAMES[entryDate.getDay()];
    const entryMinutes = entryDate.getHours() * 60 + entryDate.getMinutes();

    const facultyProfile = log.profiles as Pick<Profile, 'id' | 'name' | 'role'> | null;
    const lab = log.laboratories as Pick<Laboratory, 'id' | 'name' | 'location'> | null;

    const facultyName = facultyProfile?.name || 'Administrator / Manual Entry';
    const facultyRole = facultyProfile?.role || 'Staff';
    const labName = lab?.name || 'CCS Laboratory';
    const labLocation = lab?.location || null;

    // Exit date parsing
    const exitedAt = log.exited_at ? (log.exited_at as string) : null;
    const exitDate = exitedAt ? new Date(exitedAt) : null;

    // Check matching schedule on the day of entry
    let matchedSchedule: Schedule | null = null;
    let isLate = false;
    let minutesLate = 0;

    if (log.faculty_id) {
      // Find schedule for this faculty on this day
      const daySchedules = allSchedules.filter(
        (s) =>
          s.faculty_id === log.faculty_id &&
          s.day_of_week.toLowerCase() === dayOfWeekName.toLowerCase() &&
          (!log.laboratory_id || s.laboratory_id === log.laboratory_id),
      );

      if (daySchedules.length > 0) {
        // Find the schedule whose window is closest to entry time
        matchedSchedule = daySchedules.reduce((best, curr) => {
          if (!best) return curr;
          const currStart = timeStrToMinutes(curr.start_time);
          const bestStart = timeStrToMinutes(best.start_time);
          return Math.abs(entryMinutes - currStart) < Math.abs(entryMinutes - bestStart)
            ? curr
            : best;
        }, null as Schedule | null);

        if (matchedSchedule && log.decision === 'granted') {
          const schedStartMins = timeStrToMinutes(matchedSchedule.start_time);
          const schedEndMins = timeStrToMinutes(matchedSchedule.end_time);
          const graceDeadlineMins = schedStartMins + LATE_GRACE_PERIOD_MINUTES;

          // If arrived more than 15 minutes after schedule start time
          if (entryMinutes > graceDeadlineMins && entryMinutes <= schedEndMins + 30) {
            isLate = true;
            minutesLate = entryMinutes - schedStartMins;
          }
        }
      }
    }

    // Also recognize if the hardware log reason already recorded the late status
    if (!isLate && log.decision === 'granted' && log.reason?.toLowerCase().includes('late')) {
      isLate = true;
      const mMatch = log.reason.match(/late by (\d+)m/i);
      if (mMatch && mMatch[1]) {
        minutesLate = parseInt(mMatch[1], 10);
      }
    }

    // Determine display status and visual tags
    let displayStatus: 'Granted' | 'Denied' | 'Late' | 'Exited' = 'Granted';
    let statusBadgeColor = '#10B981'; // Green
    let statusBadgeBg = '#D1FAE5';
    let remarks = '';

    if (log.decision === 'denied') {
      displayStatus = 'Denied';
      statusBadgeColor = '#EF4444'; // Red
      statusBadgeBg = '#FEE2E2';
      remarks = log.reason || 'Unauthorized access attempt';
    } else if (isLate) {
      displayStatus = 'Late';
      statusBadgeColor = '#D97706'; // Amber
      statusBadgeBg = '#FEF3C7';
      remarks = `Late by ${minutesLate}m (Grace period: 15m)`;
    } else if (exitedAt) {
      displayStatus = 'Exited';
      statusBadgeColor = '#2563EB'; // Blue
      statusBadgeBg = '#DBEAFE';
      remarks = 'On time • Completed session';
    } else {
      displayStatus = 'Granted';
      statusBadgeColor = '#10B981'; // Green
      statusBadgeBg = '#D1FAE5';
      remarks = 'On time • Inside laboratory';
    }

    return {
      id: log.id,
      facultyId: log.faculty_id,
      facultyName,
      facultyRole,
      laboratoryId: log.laboratory_id,
      laboratoryName: labName,
      laboratoryLocation: labLocation,
      decision: log.decision,
      reason: log.reason,
      createdAt: log.created_at,
      exitedAt,
      entryDateFormatted: formatDateDisplay(entryDate),
      entryTimeFormatted: formatTimeDisplay(entryDate),
      exitTimeFormatted: exitDate ? formatTimeDisplay(exitDate) : '—',
      isLate,
      minutesLate,
      matchedSchedule: matchedSchedule
        ? {
            startTime: formatScheduleTime(matchedSchedule.start_time),
            endTime: formatScheduleTime(matchedSchedule.end_time),
            dayOfWeek: matchedSchedule.day_of_week,
          }
        : null,
      displayStatus,
      statusBadgeColor,
      statusBadgeBg,
      remarks,
    };
  });

  // 4. Apply client-side filters
  const filteredItems = rawItems.filter((item) => {
    // Laboratory filter
    if (filters.laboratoryId && filters.laboratoryId !== 'all') {
      if (item.laboratoryId !== filters.laboratoryId) return false;
    }

    // Faculty filter
    if (filters.facultyId && filters.facultyId !== 'all') {
      if (item.facultyId !== filters.facultyId) return false;
    }

    // Status filter
    if (filters.statusFilter && filters.statusFilter !== 'all') {
      if (filters.statusFilter === 'granted') {
        if (item.decision !== 'granted') return false;
      } else if (filters.statusFilter === 'denied') {
        if (item.decision !== 'denied') return false;
      } else if (filters.statusFilter === 'late') {
        if (!item.isLate) return false;
      } else if (filters.statusFilter === 'exited') {
        if (!item.exitedAt) return false;
      }
    }

    return true;
  });

  // 5. Compute summary statistics
  const uniqueFaculty = new Set(
    filteredItems.map((i) => i.facultyId).filter((id): id is string => Boolean(id)),
  );

  const summary: ReportSummary = {
    totalLogs: filteredItems.length,
    totalGranted: filteredItems.filter((i) => i.decision === 'granted').length,
    totalDenied: filteredItems.filter((i) => i.decision === 'denied').length,
    totalLate: filteredItems.filter((i) => i.isLate).length,
    totalExited: filteredItems.filter((i) => Boolean(i.exitedAt)).length,
    uniqueFacultyCount: uniqueFaculty.size,
  };

  const selectedLabName =
    filters.laboratoryId && filters.laboratoryId !== 'all'
      ? filteredItems.find((i) => i.laboratoryId === filters.laboratoryId)?.laboratoryName ||
        'Selected Lab'
      : 'All Laboratories';

  const selectedFacultyName =
    filters.facultyId && filters.facultyId !== 'all'
      ? filteredItems.find((i) => i.facultyId === filters.facultyId)?.facultyName ||
        'Selected Faculty'
      : 'All Faculty Members';

  const statusLabelMap: Record<string, string> = {
    all: 'All Statuses',
    granted: 'Granted Only',
    denied: 'Denied Only',
    late: 'Late Arrivals Only',
    exited: 'Exited Only',
  };

  const filterLabels = {
    dateRangeText: `${formatDateDisplay(filters.dateFrom)} to ${formatDateDisplay(filters.dateTo)}`,
    laboratoryName: selectedLabName,
    facultyName: selectedFacultyName,
    statusText: statusLabelMap[filters.statusFilter || 'all'] || 'All Statuses',
  };

  return {
    items: filteredItems,
    summary,
    generatedAt: new Date().toLocaleString([], {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }),
    filters,
    filterLabels,
  };
}
