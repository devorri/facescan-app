import * as DocumentPicker from 'expo-document-picker';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AlertTriangle,
  CheckSquare,
  FileSpreadsheet,
  Square,
  Upload,
  X,
} from 'lucide-react-native';
import { AppButton } from './AppButton';
import { PickerField } from './PickerField';
import { Colors, Radius, Shadow, Spacing } from '../constants/design';
import { formatScheduleTime } from '../services/scheduleService';
import {
  ROOM_NEW_LAB,
  ROOM_SKIP,
  checkClass,
  guessRoomMapping,
  importSchedules,
  loadSavedRoomMap,
  matchFaculty,
  normKey,
  parseWorkbook,
  readPickedFile,
  type ParsedProgram,
} from '../services/scheduleImportService';
import type { Laboratory, Profile, ScheduleWithRelations } from '../types/database';

type Props = {
  visible: boolean;
  onClose: () => void;
  onImported: () => Promise<void> | void;
  faculty: Profile[];
  labs: Laboratory[];
  schedules: ScheduleWithRelations[];
};

type SheetState = {
  program: ParsedProgram;
  include: boolean;
  facultyId: string | null;
  replaceExisting: boolean;
  /** class keys the user unticked */
  excluded: Set<string>;
};

const DAY_SHORT: Record<string, string> = {
  Monday: 'MON', Tuesday: 'TUE', Wednesday: 'WED', Thursday: 'THU',
  Friday: 'FRI', Saturday: 'SAT', Sunday: 'SUN',
};

export function ScheduleImportModal({ visible, onClose, onImported, faculty, labs, schedules }: Props) {
  const insets = useSafeAreaInsets();
  const [fileName, setFileName] = useState<string | null>(null);
  const [sheets, setSheets] = useState<SheetState[]>([]);
  const [roomMap, setRoomMap] = useState<Record<string, string>>({});
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);

  const reset = () => {
    setFileName(null);
    setSheets([]);
    setRoomMap({});
  };

  const close = () => {
    if (importing) return;
    reset();
    onClose();
  };

  // ── Pick + parse ─────────────────────────────────────────────────────────

  const pickFile = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
          'application/octet-stream',
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const asset = res.assets[0];

      setReading(true);
      const bytes = await readPickedFile(asset as { uri: string; file?: Blob | null });
      const programs = parseWorkbook(bytes);
      if (programs.length === 0) throw new Error('The workbook has no sheets.');
      if (programs.every((p) => p.classes.length === 0)) {
        throw new Error(programs[0]?.error ?? 'No classes found in this file.');
      }

      const next: SheetState[] = programs.map((p) => {
        const match = matchFaculty(p.instructorName, faculty);
        return {
          program: p,
          include: p.classes.length > 0,
          facultyId: match?.id ?? null,
          replaceExisting: true,
          excluded: new Set<string>(),
        };
      });

      const rooms = [...new Set(programs.flatMap((p) => p.classes.map((c) => c.room)))];
      const saved = await loadSavedRoomMap();
      setRoomMap(guessRoomMapping(rooms, labs, saved));
      setSheets(next);
      setFileName(asset.name);
    } catch (err) {
      Alert.alert('Unable to read file', err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setReading(false);
    }
  };

  // ── Derived data ─────────────────────────────────────────────────────────

  const facultyOptions = useMemo(
    () => faculty.map((f) => ({ label: `${f.name} — ${f.role}`, value: f.id })),
    [faculty],
  );

  /** Unique rooms across included sheets: key → display label */
  const rooms = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sheets) {
      if (!s.include) continue;
      for (const c of s.program.classes) {
        const k = normKey(c.room);
        if (!m.has(k)) m.set(k, c.room);
      }
    }
    return [...m.entries()].map(([key, label]) => ({ key, label }));
  }, [sheets]);

  const roomOptions = (label: string) => [
    { label: 'Skip — not a lab door', value: ROOM_SKIP },
    ...labs.map((l) => ({ label: l.location ? `${l.name} — ${l.location}` : l.name, value: l.id })),
    { label: `+ Add "${label}" as a new laboratory`, value: ROOM_NEW_LAB },
  ];

  /** Per-sheet status of every class */
  const checks = useMemo(() => {
    const replacing = new Set(
      sheets.filter((s) => s.include && s.facultyId && s.replaceExisting).map((s) => s.facultyId as string),
    );
    // Existing schedules that will remain after import
    const remaining = schedules.filter((x) => !replacing.has(x.faculty_id));
    // Also check against classes earlier in this same upload
    const pending: ScheduleWithRelations[] = [];

    return sheets.map((s) => {
      const out = new Map<string, { ok: boolean; reason?: string }>();
      if (!s.include) return out;
      for (const c of s.program.classes) {
        if (s.excluded.has(c.key)) {
          out.set(c.key, { ok: false, reason: 'Unticked' });
          continue;
        }
        const labId = roomMap[normKey(c.room)];
        const res = checkClass(c, labId, [...remaining, ...pending]);
        out.set(c.key, res);
        if (res.ok && labId && labId !== ROOM_NEW_LAB) {
          pending.push({
            id: c.key,
            faculty_id: s.facultyId ?? '',
            laboratory_id: labId,
            day_of_week: c.day,
            start_time: `${c.startTime}:00`,
            end_time: `${c.endTime}:00`,
            created_at: '',
            profiles: { id: '', name: s.program.instructorName, role: '' },
          });
        }
      }
      return out;
    });
  }, [sheets, roomMap, schedules]);

  const readyCount = sheets.reduce((sum, s, i) => {
    if (!s.include || !s.facultyId) return sum;
    let n = 0;
    checks[i]?.forEach((v) => v.ok && n++);
    return sum + n;
  }, 0);

  const missingFaculty = sheets.some((s) => s.include && !s.facultyId);

  // ── Updates ──────────────────────────────────────────────────────────────

  const updateSheet = (idx: number, patch: Partial<SheetState>) =>
    setSheets((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));

  const toggleClass = (idx: number, key: string) =>
    setSheets((prev) =>
      prev.map((s, i) => {
        if (i !== idx) return s;
        const excluded = new Set(s.excluded);
        if (excluded.has(key)) excluded.delete(key);
        else excluded.add(key);
        return { ...s, excluded };
      }),
    );

  // ── Import ───────────────────────────────────────────────────────────────

  const runImport = async () => {
    if (missingFaculty) {
      Alert.alert('Choose the instructor', 'Pick which faculty member each sheet belongs to (or turn the sheet off).');
      return;
    }
    if (readyCount === 0) {
      Alert.alert('Nothing to import', 'Map at least one room to a laboratory.');
      return;
    }

    const plan = {
      roomMap,
      sheets: sheets
        .map((s, i) => ({ s, i }))
        .filter(({ s }) => s.include && s.facultyId)
        .map(({ s, i }) => ({
          facultyId: s.facultyId as string,
          replaceExisting: s.replaceExisting,
          classes: s.program.classes.filter((c) => checks[i]?.get(c.key)?.ok),
        })),
    };

    setImporting(true);
    try {
      const res = await importSchedules(plan, labs, rooms);
      await onImported();
      const lines = [
        `${res.inserted} schedule${res.inserted === 1 ? '' : 's'} imported.`,
        res.replaced ? `${res.replaced} old schedule${res.replaced === 1 ? '' : 's'} replaced.` : '',
        res.createdLabs.length ? `New laboratories: ${res.createdLabs.join(', ')}.` : '',
        res.detailsSaved
          ? ''
          : 'Note: subject/section/room were not saved — run supabase/migrations/add_schedule_class_details.sql once.',
      ].filter(Boolean);
      Alert.alert('Import complete', lines.join('\n'));
      reset();
      onClose();
    } catch (err) {
      Alert.alert('Import failed', err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setImporting(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>Import from Excel</Text>
            <Text style={styles.subtitle} numberOfLines={1}>
              {fileName ?? "Upload the instructor's program (.xlsx)"}
            </Text>
          </View>
          <TouchableOpacity onPress={close} hitSlop={12}>
            <X size={22} color={Colors.textSecondary} strokeWidth={2} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 120 }]}>
          {sheets.length === 0 ? (
            <View style={styles.pickWrap}>
              <FileSpreadsheet size={56} color={Colors.blue} strokeWidth={1.4} />
              <Text style={styles.pickTitle}>Upload a faculty schedule</Text>
              <Text style={styles.pickText}>
                Use the INSTRUCTOR'S PROGRAM template. Each sheet = one instructor. Subject, section and
                room are read from the time grid — you'll review everything before saving.
              </Text>
              <TouchableOpacity style={styles.pickBtn} onPress={pickFile} disabled={reading} activeOpacity={0.8}>
                {reading ? (
                  <ActivityIndicator color={Colors.textWhite} />
                ) : (
                  <>
                    <Upload size={18} color={Colors.textWhite} strokeWidth={2.4} />
                    <Text style={styles.pickBtnText}>Choose Excel file</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          ) : (
            <>
              {/* Rooms → labs */}
              <View style={[styles.card, Shadow.sm]}>
                <Text style={styles.cardTitle}>Rooms → Laboratories</Text>
                <Text style={styles.cardHint}>
                  Only classes in a room linked to a laboratory are saved (that's what the door checks).
                  Your choices are remembered for next time.
                </Text>
                {rooms.map((r) => (
                  <PickerField
                    key={r.key}
                    label={`Room: ${r.label}`}
                    options={roomOptions(r.label)}
                    value={roomMap[r.key] ?? ROOM_SKIP}
                    onChange={(v) => setRoomMap((prev) => ({ ...prev, [r.key]: v }))}
                    emptyLabel="No laboratories"
                  />
                ))}
              </View>

              {/* One card per sheet / instructor */}
              {sheets.map((s, idx) => {
                const p = s.program;
                const check = checks[idx];
                return (
                  <View key={p.sheetName + idx} style={[styles.card, Shadow.sm]}>
                    <View style={styles.rowBetween}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardTitle}>{p.instructorName}</Text>
                        <Text style={styles.cardHint}>
                          Sheet "{p.sheetName}"
                          {p.schoolYear ? ` · SY ${p.schoolYear}` : ''}
                          {p.semester ? ` · ${p.semester} sem` : ''}
                        </Text>
                      </View>
                      {sheets.length > 1 && (
                        <Switch
                          value={s.include}
                          onValueChange={(v) => updateSheet(idx, { include: v })}
                          disabled={p.classes.length === 0}
                        />
                      )}
                    </View>

                    {p.error && p.classes.length === 0 ? (
                      <Text style={styles.errorText}>{p.error}</Text>
                    ) : s.include ? (
                      <>
                        <PickerField
                          label="Faculty member"
                          options={facultyOptions}
                          value={s.facultyId}
                          onChange={(v) => updateSheet(idx, { facultyId: v })}
                          emptyLabel="No faculty records found"
                        />
                        {!s.facultyId && (
                          <Text style={styles.errorText}>
                            No matching faculty found for "{p.instructorName}". Pick one above, or add them in Faculty first.
                          </Text>
                        )}

                        <View style={styles.rowBetween}>
                          <Text style={styles.switchLabel}>Replace this instructor's existing schedules</Text>
                          <Switch
                            value={s.replaceExisting}
                            onValueChange={(v) => updateSheet(idx, { replaceExisting: v })}
                          />
                        </View>

                        {p.classes.map((c) => {
                          const st = check?.get(c.key);
                          const unticked = s.excluded.has(c.key);
                          const ok = !!st?.ok;
                          return (
                            <TouchableOpacity
                              key={c.key}
                              style={[styles.classRow, !ok && styles.classRowOff]}
                              onPress={() => toggleClass(idx, c.key)}
                              activeOpacity={0.7}
                            >
                              {unticked ? (
                                <Square size={18} color={Colors.textMuted} strokeWidth={2} />
                              ) : (
                                <CheckSquare size={18} color={ok ? Colors.blue : Colors.textMuted} strokeWidth={2} />
                              )}
                              <View style={styles.dayPill}>
                                <Text style={styles.dayPillText}>{DAY_SHORT[c.day] ?? c.day}</Text>
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.classMain}>
                                  {formatScheduleTime(c.startTime)} – {formatScheduleTime(c.endTime)}
                                </Text>
                                <Text style={styles.classSub}>
                                  {[c.subjectCode, c.section, c.room].filter(Boolean).join('  ·  ')}
                                </Text>
                                {!ok && st?.reason && !unticked && (
                                  <Text style={styles.classReason}>{st.reason}</Text>
                                )}
                                {c.warning && (
                                  <View style={styles.warnRow}>
                                    <AlertTriangle size={11} color={Colors.warning} strokeWidth={2.4} />
                                    <Text style={styles.warnText}>{c.warning}</Text>
                                  </View>
                                )}
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </>
                    ) : (
                      <Text style={styles.cardHint}>Not included.</Text>
                    )}
                  </View>
                );
              })}

              <TouchableOpacity onPress={reset} style={styles.linkBtn}>
                <Text style={styles.linkText}>Choose a different file</Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>

        {sheets.length > 0 && (
          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
            <AppButton
              label={`Import ${readyCount} schedule${readyCount === 1 ? '' : 's'}`}
              onPress={runImport}
              loading={importing}
              disabled={readyCount === 0 || missingFaculty}
            />
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.surfaceAlt },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 14,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    gap: Spacing.sm,
  },
  title: { color: Colors.textPrimary, fontSize: 18, fontWeight: '800' },
  subtitle: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600', marginTop: 2 },
  body: { padding: Spacing.lg, gap: Spacing.md },

  pickWrap: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  pickTitle: { color: Colors.textPrimary, fontSize: 18, fontWeight: '800' },
  pickText: {
    color: Colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 340,
  },
  pickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.blue,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: Radius.md,
    marginTop: 8,
    minWidth: 200,
    justifyContent: 'center',
  },
  pickBtnText: { color: Colors.textWhite, fontSize: 15, fontWeight: '700' },

  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: Spacing.md,
    gap: Spacing.sm,
  },
  cardTitle: { color: Colors.textPrimary, fontSize: 15, fontWeight: '800' },
  cardHint: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600', lineHeight: 17 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  switchLabel: { color: Colors.textPrimary, fontSize: 13, fontWeight: '700', flex: 1 },
  errorText: { color: Colors.danger, fontSize: 12, fontWeight: '700' },

  classRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: Radius.sm,
    backgroundColor: Colors.surfaceAlt,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  classRowOff: { opacity: 0.6 },
  dayPill: { backgroundColor: Colors.navyDark, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 },
  dayPillText: { color: Colors.textWhite, fontSize: 10, fontWeight: '900', letterSpacing: 0.5 },
  classMain: { color: Colors.textPrimary, fontSize: 13, fontWeight: '800' },
  classSub: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600' },
  classReason: { color: Colors.danger, fontSize: 11, fontWeight: '700', marginTop: 2 },
  warnRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  warnText: { color: Colors.warning, fontSize: 11, fontWeight: '700' },

  linkBtn: { alignItems: 'center', paddingVertical: 8 },
  linkText: { color: Colors.blue, fontSize: 13, fontWeight: '700' },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: Spacing.lg,
    backgroundColor: Colors.surface,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
});
