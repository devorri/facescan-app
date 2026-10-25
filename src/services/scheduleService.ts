import { supabase } from '../lib/supabase';
import type { Schedule, ScheduleWithRelations } from '../types/database';

// Valid day-of-week values that match the DB CHECK constraint
export const DAYS_OF_WEEK = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

export type CreateScheduleInput = {
  facultyId: string;
  laboratoryId: string;
  /** One of DAYS_OF_WEEK — maps to the DB day_of_week column */
  dayOfWeek: string;
  /** Time-of-day string in "HH:MM" format (24-hour) */
  startTime: string;
  /** Time-of-day string in "HH:MM" format (24-hour) */
  endTime: string;
};

export type UpdateScheduleInput = CreateScheduleInput & {
  id: string;
};

/** Converts a "HH:MM" string to "HH:MM:SS" for the DB time column */
function toDbTime(hhmm: string): string {
  return hhmm.length === 5 ? `${hhmm}:00` : hhmm;
}

function timeStrToMinutes(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function formatScheduleTime(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return timeStr;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export async function checkScheduleConflict(input: {
  facultyId: string;
  laboratoryId: string;
  dayOfWeek: string;
  startTime: string; // "HH:MM"
  endTime: string;   // "HH:MM"
  excludeId?: string;
}): Promise<string | null> {
  const { data, error } = await supabase
    .from('schedules')
    .select(
      `
        id,
        faculty_id,
        laboratory_id,
        day_of_week,
        start_time,
        end_time,
        profiles:faculty_id(name),
        laboratories:laboratory_id(name)
      `,
    )
    .eq('day_of_week', input.dayOfWeek);

  if (error || !data) return null;

  const newStart = timeStrToMinutes(input.startTime);
  const newEnd = timeStrToMinutes(input.endTime);

  for (const row of data as any[]) {
    if (input.excludeId && row.id === input.excludeId) continue;

    const rowStart = timeStrToMinutes(row.start_time);
    const rowEnd = timeStrToMinutes(row.end_time);

    // Check interval overlap: [newStart, newEnd) with [rowStart, rowEnd)
    if (newStart < rowEnd && newEnd > rowStart) {
      const timeSpan = `${formatScheduleTime(row.start_time)} – ${formatScheduleTime(row.end_time)}`;
      const profName = (row.profiles as any)?.name ?? 'Another instructor';
      const labName = (row.laboratories as any)?.name ?? 'This laboratory';

      if (row.laboratory_id === input.laboratoryId) {
        return `${labName} is already booked on ${input.dayOfWeek} (${timeSpan}) by ${profName}.`;
      }
      if (row.faculty_id === input.facultyId) {
        return `${profName} already has a schedule in ${labName} on ${input.dayOfWeek} (${timeSpan}).`;
      }
    }
  }

  return null;
}

export async function createSchedule(input: CreateScheduleInput): Promise<Schedule> {
  if (input.startTime >= input.endTime) {
    throw new Error('End time must be after start time.');
  }

  const conflict = await checkScheduleConflict({
    facultyId: input.facultyId,
    laboratoryId: input.laboratoryId,
    dayOfWeek: input.dayOfWeek,
    startTime: input.startTime,
    endTime: input.endTime,
  });

  if (conflict) {
    throw new Error(conflict);
  }

  const { data, error } = await supabase
    .from('schedules')
    .insert({
      faculty_id:    input.facultyId,
      laboratory_id: input.laboratoryId,
      day_of_week:   input.dayOfWeek,
      start_time:    toDbTime(input.startTime),
      end_time:      toDbTime(input.endTime),
    })
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function listSchedules(): Promise<ScheduleWithRelations[]> {
  const { data, error } = await supabase
    .from('schedules')
    .select(
      `
        id,
        faculty_id,
        laboratory_id,
        day_of_week,
        start_time,
        end_time,
        created_at,
        profiles:faculty_id(id, name, role),
        laboratories:laboratory_id(id, name, location)
      `,
    )
    .order('day_of_week', { ascending: true })
    .order('start_time', { ascending: true });

  if (error) throw error;
  return (data ?? []) as ScheduleWithRelations[];
}

export async function updateSchedule(input: UpdateScheduleInput): Promise<Schedule> {
  if (input.startTime >= input.endTime) {
    throw new Error('End time must be after start time.');
  }

  const conflict = await checkScheduleConflict({
    facultyId: input.facultyId,
    laboratoryId: input.laboratoryId,
    dayOfWeek: input.dayOfWeek,
    startTime: input.startTime,
    endTime: input.endTime,
    excludeId: input.id,
  });

  if (conflict) {
    throw new Error(conflict);
  }

  const { data, error } = await supabase
    .from('schedules')
    .update({
      faculty_id:    input.facultyId,
      laboratory_id: input.laboratoryId,
      day_of_week:   input.dayOfWeek,
      start_time:    toDbTime(input.startTime),
      end_time:      toDbTime(input.endTime),
    })
    .eq('id', input.id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteSchedule(scheduleId: string): Promise<void> {
  const { error } = await supabase.from('schedules').delete().eq('id', scheduleId);

  if (error) throw error;
}

export type FacultyScheduleCheck = {
  allowed: boolean;
  activeSchedule?: ScheduleWithRelations;
  todaySchedules: ScheduleWithRelations[];
  message: string;
};

/**
 * Validates whether a faculty member currently has an active scheduled class right now.
 * Used to enforce that Faculty can only use Force Door Unlock during their assigned schedule hours.
 */
export async function isFacultyScheduledNow(params: {
  facultyId?: string;
  username?: string;
  name?: string;
}): Promise<FacultyScheduleCheck> {
  let targetFacultyId = params.facultyId;

  // If no facultyId provided, look up by profile name or username
  if (!targetFacultyId && (params.name || params.username)) {
    const search = (params.name || params.username || '').trim();
    const { data: prof } = await supabase
      .from('profiles')
      .select('id, name')
      .ilike('name', search)
      .maybeSingle();

    if (prof?.id) {
      targetFacultyId = prof.id;
    } else {
      const { data: allProfs } = await supabase.from('profiles').select('id, name');
      if (allProfs) {
        const clean = search.toLowerCase().replace(/[^a-z0-9]/g, '');
        const found = allProfs.find((p) => {
          const norm = (p.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
          return norm === clean || norm.includes(clean) || clean.includes(norm);
        });
        targetFacultyId = found?.id;
      }
    }
  }

  if (!targetFacultyId) {
    return {
      allowed: false,
      todaySchedules: [],
      message: 'Faculty profile not found. Force door unlock is only available during your scheduled class hours.',
    };
  }

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const now = new Date();
  const currentDay = days[now.getDay()];
  const currentMins = now.getHours() * 60 + now.getMinutes();

  // Query schedules for this faculty for today
  const { data, error } = await supabase
    .from('schedules')
    .select(
      `
        id,
        faculty_id,
        laboratory_id,
        day_of_week,
        start_time,
        end_time,
        created_at,
        profiles:faculty_id(id, name, role),
        laboratories:laboratory_id(id, name, location)
      `,
    )
    .eq('faculty_id', targetFacultyId)
    .eq('day_of_week', currentDay);

  if (error || !data || data.length === 0) {
    return {
      allowed: false,
      todaySchedules: [],
      message: `You have no laboratory classes scheduled for today (${currentDay}). Force unlock is restricted to your class hours.`,
    };
  }

  const todaySchedules = data as unknown as ScheduleWithRelations[];

  for (const s of todaySchedules) {
    const sStart = timeStrToMinutes(s.start_time);
    const sEnd = timeStrToMinutes(s.end_time);

    // Allow during schedule window (and up to 15 mins before class for preparation)
    if (currentMins >= sStart - 15 && currentMins <= sEnd) {
      return {
        allowed: true,
        activeSchedule: s,
        todaySchedules,
        message: `Active class schedule: ${formatScheduleTime(s.start_time)} – ${formatScheduleTime(s.end_time)} (${s.laboratories?.name ?? 'Lab'})`,
      };
    }
  }

  const timesStr = todaySchedules
    .map((s) => `${formatScheduleTime(s.start_time)} – ${formatScheduleTime(s.end_time)}`)
    .join(', ');

  return {
    allowed: false,
    todaySchedules,
    message: `Outside your assigned hours today (${currentDay}: ${timesStr}). As a Faculty member, Force Door Access is restricted to your class schedule.`,
  };
}

