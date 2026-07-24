import DateTimePicker from '@react-native-community/datetimepicker';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, FlatList, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { AppButton } from '../components/AppButton';
import { PickerField } from '../components/PickerField';
import { Colors, Radius, Shadow, Spacing } from '../constants/design';
import { listFaculty } from '../services/facultyService';
import { listLaboratories } from '../services/laboratoryService';
import {
  DAYS_OF_WEEK,
  createSchedule,
  deleteSchedule,
  listSchedules,
  updateSchedule,
} from '../services/scheduleService';
import type { Laboratory, Profile, ScheduleWithRelations } from '../types/database';

// ─── Constants ───────────────────────────────────────────────────────────────

const DAY_OPTIONS = DAYS_OF_WEEK.map((d) => ({ label: d, value: d }));

/** Operating hour bounds (24-h minutes from midnight) */
const MIN_MINUTES = 7 * 60;   // 7:00 AM
const MAX_MINUTES = 17 * 60;  // 5:00 PM

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parse a DB "HH:MM:SS" (or "HH:MM") string into a Date object so we can
 * feed it to DateTimePicker, which only accepts Date values.
 */
function parseDbTime(timeStr: string): Date {
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date();
  d.setHours(h ?? 7, m ?? 0, 0, 0);
  return d;
}

/** Format a Date as a "HH:MM" string for the service layer. */
function dateToHHMM(date: Date): string {
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Format a DB time string ("HH:MM:SS") for human display ("8:00 AM").
 * Returns a fallback of the raw string on parse failure.
 */
function formatDbTime(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return timeStr;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

/** Return a default start Date at 8:00 AM today. */
function defaultStart(): Date {
  const d = new Date();
  d.setHours(8, 0, 0, 0);
  return d;
}

/** Return a default end Date one hour after start. */
function defaultEnd(start: Date): Date {
  const d = new Date(start);
  d.setHours(d.getHours() + 1);
  return d;
}

/** Return the current weekday name (Mon–Sat), defaulting to Monday on Sunday. */
function defaultDay(): string {
  const dayIndex = new Date().getDay(); // 0 = Sun
  return DAYS_OF_WEEK[dayIndex === 0 ? 0 : dayIndex - 1] ?? 'Monday';
}

// ─── Validation ───────────────────────────────────────────────────────────────

function validateWindow(start: Date, end: Date): string | null {
  const startMins = start.getHours() * 60 + start.getMinutes();
  const endMins   = end.getHours()   * 60 + end.getMinutes();

  if (startMins < MIN_MINUTES || startMins > MAX_MINUTES) {
    return 'Start time must be within operating hours (7:00 AM – 5:00 PM).';
  }
  if (endMins < MIN_MINUTES || endMins > MAX_MINUTES) {
    return 'End time must be within operating hours (7:00 AM – 5:00 PM).';
  }
  if (endMins <= startMins) {
    return 'End time must be after start time.';
  }
  return null;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function LaboratorySchedulingScreen() {
  const [faculty, setFaculty]               = useState<Profile[]>([]);
  const [labs, setLabs]                     = useState<Laboratory[]>([]);
  const [schedules, setSchedules]           = useState<ScheduleWithRelations[]>([]);
  const [selectedSchedule, setSelectedSchedule] = useState<ScheduleWithRelations | null>(null);

  // Form fields
  const [facultyId, setFacultyId]       = useState<string | null>(null);
  const [laboratoryId, setLaboratoryId] = useState<string | null>(null);
  const [dayOfWeek, setDayOfWeek]       = useState<string>(defaultDay);
  const [startTime, setStartTime]       = useState<Date>(defaultStart);
  const [endTime, setEndTime]           = useState<Date>(() => defaultEnd(defaultStart()));

  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);

  // ── Data loading ────────────────────────────────────────────────────────────

  const loadData = useCallback(async () => {
    const [facultyRows, labRows, scheduleRows] = await Promise.all([
      listFaculty(),
      listLaboratories(),
      listSchedules(),
    ]);
    setFaculty(facultyRows);
    setLabs(labRows);
    setSchedules(scheduleRows);
    setFacultyId((prev) => prev ?? facultyRows[0]?.id ?? null);
    setLaboratoryId((prev) => prev ?? labRows[0]?.id ?? null);
  }, []);

  useEffect(() => {
    loadData()
      .catch((err) => Alert.alert('Unable to load schedules', getErrorMessage(err)))
      .finally(() => setLoading(false));
  }, [loadData]);

  // ── Picker options ──────────────────────────────────────────────────────────

  const facultyOptions = useMemo(
    () => faculty.map((f) => ({ label: `${f.name} — ${f.role}`, value: f.id })),
    [faculty],
  );

  const labOptions = useMemo(
    () =>
      labs.map((l) => ({
        label: l.location ? `${l.name} — ${l.location}` : l.name,
        value: l.id,
      })),
    [labs],
  );

  // ── Form actions ────────────────────────────────────────────────────────────

  const resetForm = () => {
    setSelectedSchedule(null);
    setFacultyId(faculty[0]?.id ?? null);
    setLaboratoryId(labs[0]?.id ?? null);
    setDayOfWeek(defaultDay());
    const start = defaultStart();
    setStartTime(start);
    setEndTime(defaultEnd(start));
  };

  const selectSchedule = (schedule: ScheduleWithRelations) => {
    setSelectedSchedule(schedule);
    setFacultyId(schedule.faculty_id);
    setLaboratoryId(schedule.laboratory_id);
    setDayOfWeek(schedule.day_of_week);
    setStartTime(parseDbTime(schedule.start_time));
    setEndTime(parseDbTime(schedule.end_time));
  };

  const saveSchedule = async () => {
    if (!facultyId || !laboratoryId) {
      Alert.alert('Missing selection', 'Choose a faculty member and laboratory.');
      return;
    }

    const validationError = validateWindow(startTime, endTime);
    if (validationError) {
      Alert.alert('Invalid Schedule Window', validationError);
      return;
    }

    setSaving(true);
    try {
      const input = {
        facultyId,
        laboratoryId,
        dayOfWeek,
        startTime: dateToHHMM(startTime),
        endTime:   dateToHHMM(endTime),
      };

      if (selectedSchedule) {
        await updateSchedule({ id: selectedSchedule.id, ...input });
      } else {
        await createSchedule(input);
      }

      await loadData();
      resetForm();
      Alert.alert(selectedSchedule ? 'Schedule updated' : 'Schedule assigned');
    } catch (error) {
      Alert.alert('Unable to save schedule', getErrorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const removeSchedule = (schedule: ScheduleWithRelations) => {
    Alert.alert('Delete schedule?', 'This faculty schedule will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteSchedule(schedule.id);
            if (selectedSchedule?.id === schedule.id) resetForm();
            await loadData();
          } catch (error) {
            Alert.alert('Unable to delete schedule', getErrorMessage(error));
          }
        },
      },
    ]);
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Laboratory Schedule</Text>

      {/* ── Assignment form ── */}
      <View style={styles.card}>
        <PickerField
          label="Faculty Member"
          options={facultyOptions}
          value={facultyId}
          onChange={setFacultyId}
          emptyLabel={loading ? 'Loading faculty…' : 'No faculty records found'}
        />
        <PickerField
          label="Laboratory Room"
          options={labOptions}
          value={laboratoryId}
          onChange={setLaboratoryId}
          emptyLabel={loading ? 'Loading laboratories…' : 'No laboratory records found'}
        />
      </View>

      {/* ── Day & time window ── */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Schedule Window</Text>

        <PickerField
          label="Day of Week"
          options={DAY_OPTIONS}
          value={dayOfWeek}
          onChange={(v) => v && setDayOfWeek(v)}
          emptyLabel="No days available"
        />

        <View style={styles.timeRow}>
          <View style={styles.timeBlock}>
            <Text style={styles.timeLabel}>Start Time</Text>
            <DateTimePicker
              value={startTime}
              mode="time"
              is24Hour={false}
              display={Platform.OS === 'ios' ? 'compact' : 'default'}
              onChange={(_, selected) => selected && setStartTime(selected)}
            />
          </View>
          <View style={styles.timeSeparator}>
            <Text style={styles.timeSeparatorText}>→</Text>
          </View>
          <View style={styles.timeBlock}>
            <Text style={styles.timeLabel}>End Time</Text>
            <DateTimePicker
              value={endTime}
              mode="time"
              is24Hour={false}
              display={Platform.OS === 'ios' ? 'compact' : 'default'}
              onChange={(_, selected) => selected && setEndTime(selected)}
            />
          </View>
        </View>

        <Text style={styles.hint}>Operating hours: 7:00 AM – 5:00 PM, Mon – Sat</Text>
      </View>

      {/* ── Action buttons ── */}
      <View style={styles.actions}>
        <AppButton
          label={selectedSchedule ? 'Update Schedule' : 'Assign Schedule'}
          disabled={!facultyId || !laboratoryId || loading}
          loading={saving}
          onPress={saveSchedule}
        />
        <AppButton label="Clear Form" variant="secondary" onPress={resetForm} />
      </View>

      {/* ── Schedule list ── */}
      <Text style={styles.sectionTitle}>Assigned Schedules</Text>
      <FlatList
        scrollEnabled={false}
        data={schedules}
        keyExtractor={(item) => item.id}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={<Text style={styles.muted}>No schedules found.</Text>}
        contentContainerStyle={styles.listContainer}
        renderItem={({ item }) => (
          <View style={[styles.scheduleRow, Shadow.sm]}>
            <View style={styles.rowAccent} />
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>{item.profiles?.name ?? 'Unknown faculty'}</Text>
              <Text style={styles.rowMeta}>🏫 {item.laboratories?.name ?? 'Unknown laboratory'}</Text>
              <View style={styles.scheduleWindow}>
                <Text style={styles.dayBadge}>{item.day_of_week}</Text>
                <Text style={styles.timeBadge}>
                  {formatDbTime(item.start_time)} – {formatDbTime(item.end_time)}
                </Text>
              </View>
            </View>
            <View style={styles.rowActions}>
              <AppButton label="Edit"   variant="secondary" onPress={() => selectSchedule(item)} />
              <AppButton label="Delete" variant="danger"    onPress={() => removeSchedule(item)} />
            </View>
          </View>
        )}
      />
    </ScrollView>
  );
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unexpected error';
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    gap: Spacing.lg,
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl,
  },
  heading: {
    color: Colors.textPrimary,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.lg,
    gap: Spacing.md,
    borderWidth: 1,
    borderColor: Colors.border,
    ...Shadow.sm,
  },
  sectionTitle: {
    color: Colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  timeBlock: {
    flex: 1,
    gap: 6,
  },
  timeLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  timeSeparator: {
    paddingTop: 22,
    alignItems: 'center',
  },
  timeSeparatorText: {
    color: Colors.textMuted,
    fontSize: 18,
    fontWeight: '700',
  },
  hint: {
    color: Colors.textMuted,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  listContainer: {
    gap: Spacing.sm,
  },
  scheduleRow: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    padding: Spacing.md,
    paddingLeft: Spacing.md + 6,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
    gap: Spacing.sm,
  },
  rowAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: Colors.blue,
    borderTopLeftRadius: Radius.md,
    borderBottomLeftRadius: Radius.md,
  },
  rowBody: {
    flex: 1,
    gap: 4,
  },
  rowTitle: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  rowMeta: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  scheduleWindow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: 2,
  },
  dayBadge: {
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    color: Colors.blue,
    fontSize: 11,
    fontWeight: '800',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  timeBadge: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  rowActions: {
    flexDirection: 'row',
    gap: 8,
  },
  muted: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  separator: {
    height: 8,
  },
});
