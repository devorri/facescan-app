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

export async function createSchedule(input: CreateScheduleInput): Promise<Schedule> {
  if (input.startTime >= input.endTime) {
    throw new Error('End time must be after start time.');
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
