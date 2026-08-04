import DateTimePicker from '@react-native-community/datetimepicker';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CalendarDays,
  Clock,
  PenLine,
  Plus,
  Trash2,
  X,
} from 'lucide-react-native';
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

// Day abbreviations for compact badges
const DAY_SHORT: Record<string, string> = {
  Monday: 'MON',
  Tuesday: 'TUE',
  Wednesday: 'WED',
  Thursday: 'THU',
  Friday: 'FRI',
  Saturday: 'SAT',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseDbTime(timeStr: string): Date {
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date();
  d.setHours(h ?? 7, m ?? 0, 0, 0);
  return d;
}

function dateToHHMM(date: Date): string {
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  return `${h}:${m}`;
}

function formatDbTime(timeStr: string): string {
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h) || isNaN(m)) return timeStr;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 || 12;
  return `${hour}:${m.toString().padStart(2, '0')} ${ampm}`;
}

function defaultStart(): Date {
  const d = new Date();
  d.setHours(8, 0, 0, 0);
  return d;
}

function defaultEnd(start: Date): Date {
  const d = new Date(start);
  d.setHours(d.getHours() + 1);
  return d;
}

function defaultDay(): string {
  const dayIndex = new Date().getDay();
  return DAYS_OF_WEEK[dayIndex === 0 ? 0 : dayIndex - 1] ?? 'Monday';
}

// ─── Validation ──────────────────────────────────────────────────────────────

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

// ─── Component ───────────────────────────────────────────────────────────────

export function LaboratorySchedulingScreen() {
  const insets = useSafeAreaInsets();
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
  const [formOpen, setFormOpen] = useState(false);

  // ── Data loading ──────────────────────────────────────────────────────────

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

  // ── Picker options ─────────────────────────────────────────────────────────

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

  // ── Grouped schedules ─────────────────────────────────────────────────────

  const groupedSchedules = useMemo(() => {
    const groups: { day: string; items: ScheduleWithRelations[] }[] = [];
    for (const day of DAYS_OF_WEEK) {
      const items = schedules.filter((s) => s.day_of_week === day);
      if (items.length > 0) {
        // Sort by start time within each day
        items.sort((a, b) => a.start_time.localeCompare(b.start_time));
        groups.push({ day, items });
      }
    }
    return groups;
  }, [schedules]);

  // ── Form actions ───────────────────────────────────────────────────────────

  const resetForm = () => {
    setSelectedSchedule(null);
    setFacultyId(faculty[0]?.id ?? null);
    setLaboratoryId(labs[0]?.id ?? null);
    setDayOfWeek(defaultDay());
    const start = defaultStart();
    setStartTime(start);
    setEndTime(defaultEnd(start));
  };

  const openNewForm = () => {
    resetForm();
    setFormOpen(true);
  };

  const selectSchedule = (schedule: ScheduleWithRelations) => {
    setSelectedSchedule(schedule);
    setFacultyId(schedule.faculty_id);
    setLaboratoryId(schedule.laboratory_id);
    setDayOfWeek(schedule.day_of_week);
    setStartTime(parseDbTime(schedule.start_time));
    setEndTime(parseDbTime(schedule.end_time));
    setFormOpen(true);
  };

  const closeForm = () => {
    setFormOpen(false);
    resetForm();
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
      closeForm();
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

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={styles.centered}>
        <Text style={styles.mutedText}>Loading schedules…</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Header */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.heading}>Schedules</Text>
            <Text style={styles.subheading}>
              {schedules.length} schedule{schedules.length !== 1 ? 's' : ''} assigned
            </Text>
          </View>
          <TouchableOpacity style={styles.addButton} onPress={openNewForm} activeOpacity={0.8}>
            <Plus size={20} color={Colors.textWhite} strokeWidth={2.5} />
            <Text style={styles.addButtonText}>Add</Text>
          </TouchableOpacity>
        </View>

        {/* Operating hours info */}
        <View style={styles.infoChip}>
          <Clock size={13} color={Colors.textSecondary} strokeWidth={2} />
          <Text style={styles.infoText}>Mon – Sat  ·  7:00 AM – 5:00 PM</Text>
        </View>

        {/* Day-grouped schedule list */}
        {groupedSchedules.length === 0 ? (
          <View style={styles.emptyState}>
            <CalendarDays size={40} color={Colors.textMuted} strokeWidth={1.4} />
            <Text style={styles.emptyTitle}>No schedules yet</Text>
            <Text style={styles.emptySubtitle}>Tap "Add" to assign a faculty schedule</Text>
          </View>
        ) : (
          groupedSchedules.map((group) => (
            <View key={group.day} style={styles.dayGroup}>
              {/* Day header */}
              <View style={styles.dayHeader}>
                <View style={styles.dayBadge}>
                  <Text style={styles.dayBadgeText}>{DAY_SHORT[group.day] ?? group.day}</Text>
                </View>
                <Text style={styles.dayLabel}>{group.day}</Text>
                <Text style={styles.dayCount}>{group.items.length}</Text>
              </View>

              {/* Schedule cards for this day */}
              {group.items.map((item) => (
                <View key={item.id} style={[styles.scheduleCard, Shadow.sm]}>
                  <View style={styles.cardAccent} />
                  <View style={styles.cardBody}>
                    <Text style={styles.cardFaculty}>
                      {item.profiles?.name ?? 'Unknown faculty'}
                    </Text>
                    <Text style={styles.cardLab}>
                      {item.laboratories?.name ?? 'Unknown laboratory'}
                    </Text>
                    <View style={styles.timeRow}>
                      <Clock size={12} color={Colors.blue} strokeWidth={2} />
                      <Text style={styles.timeText}>
                        {formatDbTime(item.start_time)} → {formatDbTime(item.end_time)}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.cardActions}>
                    <TouchableOpacity
                      style={styles.iconBtn}
                      onPress={() => selectSchedule(item)}
                      activeOpacity={0.7}
                    >
                      <PenLine size={16} color={Colors.blue} strokeWidth={2} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.iconBtn}
                      onPress={() => removeSchedule(item)}
                      activeOpacity={0.7}
                    >
                      <Trash2 size={16} color={Colors.danger} strokeWidth={2} />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>

      {/* ── Form Modal ── */}
      <Modal
        visible={formOpen}
        transparent
        animationType="slide"
        onRequestClose={closeForm}
      >
        <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={closeForm} />
        <View style={styles.formSheet}>
          {/* Form header */}
          <View style={styles.formHeader}>
            <Text style={styles.formTitle}>
              {selectedSchedule ? 'Edit Schedule' : 'New Schedule'}
            </Text>
            <TouchableOpacity onPress={closeForm} hitSlop={12}>
              <X size={22} color={Colors.textSecondary} strokeWidth={2} />
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={[styles.formBody, { paddingBottom: Math.max(insets.bottom + 20, 32) }]} keyboardShouldPersistTaps="handled">
            {/* Pickers */}
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
            <PickerField
              label="Day of Week"
              options={DAY_OPTIONS}
              value={dayOfWeek}
              onChange={(v) => v && setDayOfWeek(v)}
              emptyLabel="No days available"
            />

            {/* Time pickers */}
            <View style={styles.formTimeRow}>
              <View style={styles.formTimeBlock}>
                <Text style={styles.formTimeLabel}>Start Time</Text>
                <DateTimePicker
                  value={startTime}
                  mode="time"
                  is24Hour={false}
                  display={Platform.OS === 'ios' ? 'compact' : 'default'}
                  onChange={(_, selected) => selected && setStartTime(selected)}
                />
              </View>
              <View style={styles.formTimeSep}>
                <Text style={styles.formTimeSepText}>→</Text>
              </View>
              <View style={styles.formTimeBlock}>
                <Text style={styles.formTimeLabel}>End Time</Text>
                <DateTimePicker
                  value={endTime}
                  mode="time"
                  is24Hour={false}
                  display={Platform.OS === 'ios' ? 'compact' : 'default'}
                  onChange={(_, selected) => selected && setEndTime(selected)}
                />
              </View>
            </View>

            {/* Actions */}
            <View style={styles.formActions}>
              <AppButton
                label={selectedSchedule ? 'Update Schedule' : 'Assign Schedule'}
                disabled={!facultyId || !laboratoryId}
                loading={saving}
                onPress={saveSchedule}
              />
              <AppButton label="Cancel" variant="secondary" onPress={closeForm} />
            </View>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unexpected error';
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  container: {
    padding: Spacing.lg,
    paddingBottom: Spacing.xxl + 20,
    gap: Spacing.md,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mutedText: {
    color: Colors.textSecondary,
    fontSize: 14,
    fontWeight: '600',
  },

  // ── Header ─────────────────────────────────
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heading: {
    color: Colors.textPrimary,
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subheading: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    marginTop: -2,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.blue,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Radius.md,
    gap: 6,
    ...Shadow.sm,
  },
  addButtonText: {
    color: Colors.textWhite,
    fontSize: 14,
    fontWeight: '700',
  },

  // ── Info chip ──────────────────────────────
  infoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: Radius.sm,
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  infoText: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },

  // ── Empty state ────────────────────────────
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  emptyTitle: {
    color: Colors.textPrimary,
    fontSize: 17,
    fontWeight: '800',
    marginTop: 8,
  },
  emptySubtitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
  },

  // ── Day groups ─────────────────────────────
  dayGroup: {
    gap: Spacing.sm,
  },
  dayHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 4,
  },
  dayBadge: {
    backgroundColor: Colors.navyDark,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  dayBadgeText: {
    color: Colors.textWhite,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  dayLabel: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  dayCount: {
    color: Colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    backgroundColor: Colors.surfaceAlt,
    borderRadius: 10,
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 2,
  },

  // ── Schedule card ──────────────────────────
  scheduleCard: {
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
  cardAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: Colors.blue,
    borderTopLeftRadius: Radius.md,
    borderBottomLeftRadius: Radius.md,
  },
  cardBody: {
    flex: 1,
    gap: 3,
  },
  cardFaculty: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: '800',
  },
  cardLab: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 2,
  },
  timeText: {
    color: Colors.blue,
    fontSize: 12,
    fontWeight: '700',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 4,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
  },

  // ── Form Modal ─────────────────────────────
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 13, 26, 0.5)',
  },
  formSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  formTitle: {
    color: Colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  formBody: {
    padding: Spacing.lg,
    gap: Spacing.md,
    paddingBottom: 32,
  },

  // ── Form time pickers ──────────────────────
  formTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  formTimeBlock: {
    flex: 1,
    gap: 6,
  },
  formTimeLabel: {
    color: Colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  formTimeSep: {
    paddingTop: 22,
    alignItems: 'center',
  },
  formTimeSepText: {
    color: Colors.textMuted,
    fontSize: 18,
    fontWeight: '700',
  },
  formActions: {
    gap: 10,
    marginTop: Spacing.sm,
  },
});
