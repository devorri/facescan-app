/**
 * Faculty schedule import from the university "Instructor's Program" Excel template.
 *
 * Flow:
 *   1. readWorkbook(bytes)        → raw cells + merged ranges for every sheet (.xlsx only)
 *   2. parseFacultyProgram(sheet) → instructor name + list of classes (day, time, subject, section, room)
 *   3. The import modal lets the custodian confirm the instructor, map rooms → laboratories,
 *      and untick anything they don't want.
 *   4. importSchedules(plan)      → inserts into public.schedules (optionally replacing the
 *      instructor's old schedules).
 *
 * Template layout it understands (one instructor per sheet, any number of sheets):
 *   - A header row with day names (Monday … Saturday/Sunday) — the "Time/Day" row.
 *   - A time column on the left with 30-min slots like "7:00-7:30", "12:30-1:00", "1:00-1:30".
 *     Hours 1–6 without AM/PM are treated as PM.
 *   - Each class is a run of 3 cells in a day column: subject code, section, room
 *     (section and room may be in either order). Labels like LUNCH BREAK / CONSULTATION HOURS
 *     and blank cells separate classes.
 *   - An "Instructor" label with the name in the next filled cell to the right.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { strFromU8, unzipSync } from 'fflate';
import { supabase } from '../lib/supabase';
import type { Laboratory, Profile, ScheduleWithRelations } from '../types/database';

// ─── Types ───────────────────────────────────────────────────────────────────

export type RawSheet = {
  name: string;
  /** key = `${row},${col}` (1-based) */
  cells: Map<string, string | number>;
  merges: { r1: number; c1: number; r2: number; c2: number }[];
  maxRow: number;
  maxCol: number;
};

export type ParsedClass = {
  key: string;
  day: string;
  /** "HH:MM" 24-hour */
  startTime: string;
  /** "HH:MM" 24-hour */
  endTime: string;
  subjectCode: string;
  section: string;
  room: string;
  /** Raw cell texts that formed this class (for display / debugging) */
  rawCells: string[];
  /** Set when the parser was not sure about this block */
  warning?: string;
};

export type ParsedProgram = {
  sheetName: string;
  instructorName: string;
  schoolYear: string;
  semester: string;
  classes: ParsedClass[];
  /** Problems that stopped the sheet from being read */
  error?: string;
};

/** Special values used in the room → lab mapping */
export const ROOM_SKIP = '__skip__';
export const ROOM_NEW_LAB = '__new__';

export type ImportPlanSheet = {
  facultyId: string;
  replaceExisting: boolean;
  classes: ParsedClass[];
};

export type ImportPlan = {
  sheets: ImportPlanSheet[];
  /** room (normalized key) → laboratory id | ROOM_SKIP | ROOM_NEW_LAB */
  roomMap: Record<string, string>;
};

export type ImportResult = {
  inserted: number;
  replaced: number;
  createdLabs: string[];
  detailsSaved: boolean;
};

// ─── 1. Minimal .xlsx reader (zip + XML) ────────────────────────────────────

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, '&');
}

/** Concatenate every <t> inside a fragment (handles rich text runs, ignores phonetic hints). */
function textOf(fragment: string): string {
  const cleaned = fragment.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let out = '';
  const re = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleaned))) out += decodeXml(m[1]);
  return out;
}

function colToNum(col: string): number {
  let n = 0;
  for (const ch of col) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function parseRef(ref: string): { r: number; c: number } | null {
  const m = /^\$?([A-Z]+)\$?(\d+)$/.exec(ref.trim());
  if (!m) return null;
  return { r: parseInt(m[2], 10), c: colToNum(m[1]) };
}

function resolveZipPath(target: string): string {
  let t = target.replace(/\\/g, '/');
  if (t.startsWith('/')) return t.slice(1);
  if (!t.startsWith('xl/')) t = `xl/${t}`;
  // collapse "xl/../x"
  const parts: string[] = [];
  for (const p of t.split('/')) {
    if (p === '..') parts.pop();
    else if (p !== '.') parts.push(p);
  }
  return parts.join('/');
}

export function readWorkbook(bytes: Uint8Array): RawSheet[] {
  // .xls (old binary) starts with D0 CF 11 E0; .xlsx is a zip ("PK")
  if (bytes[0] === 0xd0 && bytes[1] === 0xcf) {
    throw new Error('This is an old .xls file. Open it in Excel and "Save As" .xlsx, then upload again.');
  }
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new Error('This file is not a valid Excel (.xlsx) workbook.');
  }

  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes, {
      filter: (f) =>
        f.name === 'xl/workbook.xml' ||
        f.name === 'xl/_rels/workbook.xml.rels' ||
        f.name === 'xl/sharedStrings.xml' ||
        f.name.startsWith('xl/worksheets/sheet'),
    });
  } catch {
    throw new Error('Could not open the Excel file. Make sure it is a .xlsx file and not password-protected.');
  }

  const read = (p: string) => (files[p] ? strFromU8(files[p]) : '');

  // Shared strings
  const shared: string[] = [];
  const ss = read('xl/sharedStrings.xml');
  if (ss) {
    const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>|<si\s*\/>/g;
    let m: RegExpExecArray | null;
    while ((m = siRe.exec(ss))) shared.push(m[1] ? textOf(m[1]) : '');
  }

  // Sheet names → paths
  const rels = read('xl/_rels/workbook.xml.rels');
  const relMap = new Map<string, string>();
  {
    const re = /<Relationship\b([^>]*)\/?>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(rels))) {
      const id = /\bId="([^"]+)"/.exec(m[1])?.[1];
      const target = /\bTarget="([^"]+)"/.exec(m[1])?.[1];
      if (id && target) relMap.set(id, resolveZipPath(target));
    }
  }

  const wb = read('xl/workbook.xml');
  const sheetDefs: { name: string; path: string }[] = [];
  {
    const re = /<sheet\b([^>]*)\/?>/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(wb))) {
      const name = decodeXml(/\bname="([^"]*)"/.exec(m[1])?.[1] ?? 'Sheet');
      const rid = /\br:id="([^"]+)"/.exec(m[1])?.[1] ?? /\bid="([^"]+)"/.exec(m[1])?.[1];
      const state = /\bstate="([^"]+)"/.exec(m[1])?.[1];
      if (state === 'hidden' || state === 'veryHidden') continue;
      const path = rid ? relMap.get(rid) : undefined;
      if (path && files[path]) sheetDefs.push({ name, path });
    }
  }

  return sheetDefs.map(({ name, path }) => {
    const xml = read(path);
    const cells = new Map<string, string | number>();
    let maxRow = 0;
    let maxCol = 0;

    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let m: RegExpExecArray | null;
    while ((m = cellRe.exec(xml))) {
      const attrs = m[1];
      const body = m[2] ?? '';
      const ref = /\br="([^"]+)"/.exec(attrs)?.[1];
      if (!ref || !body) continue;
      const pos = parseRef(ref);
      if (!pos) continue;
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
      const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1];

      let value: string | number | undefined;
      if (type === 's') value = v != null ? shared[parseInt(v, 10)] ?? '' : '';
      else if (type === 'inlineStr') value = textOf(body);
      else if (type === 'str' || type === 'e' || type === 'd') value = v != null ? decodeXml(v) : '';
      else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
      else if (v != null) {
        const n = Number(v);
        value = Number.isFinite(n) ? n : decodeXml(v);
      }

      if (value === undefined || value === '') continue;
      cells.set(`${pos.r},${pos.c}`, value);
      maxRow = Math.max(maxRow, pos.r);
      maxCol = Math.max(maxCol, pos.c);
    }

    const merges: RawSheet['merges'] = [];
    const mRe = /<mergeCell\b[^>]*\bref="([^"]+)"/g;
    while ((m = mRe.exec(xml))) {
      const [a, b] = m[1].split(':');
      const p1 = parseRef(a);
      const p2 = parseRef(b ?? a);
      if (p1 && p2) merges.push({ r1: p1.r, c1: p1.c, r2: p2.r, c2: p2.c });
    }

    return { name, cells, merges, maxRow, maxCol };
  });
}

// ─── 2. Template parser ─────────────────────────────────────────────────────

const DAY_NAMES: Record<string, string> = {
  monday: 'Monday', mon: 'Monday',
  tuesday: 'Tuesday', tue: 'Tuesday', tues: 'Tuesday',
  wednesday: 'Wednesday', wed: 'Wednesday',
  thursday: 'Thursday', thu: 'Thursday', thur: 'Thursday', thurs: 'Thursday',
  friday: 'Friday', fri: 'Friday',
  saturday: 'Saturday', sat: 'Saturday',
  sunday: 'Sunday', sun: 'Sunday',
};

/** Cells that are not classes and break a run (lunch, consultation, etc.) */
const LABEL_RE = /\b(lunch|break|consult|consultation|vacant|office\s*hours?|research|extension|admin|official\s*time|travel|free)\b/i;

/** Section like "BSIT 1A", "BSCS 2-B", "ACT 1A", "BSIS-3C" */
const SECTION_RE = /^[A-Z]{2,6}[\s-]?\d[\s-]?[A-Z]{1,2}\d?$/i;

const TIME_RANGE_RE =
  /(\d{1,2})\s*[:.]\s*(\d{2})\s*(am|pm|a\.m\.|p\.m\.)?\s*[-–—to]+\s*(\d{1,2})\s*[:.]\s*(\d{2})\s*(am|pm|a\.m\.|p\.m\.)?/i;

function cellText(v: string | number | undefined): string {
  if (v == null) return '';
  if (typeof v === 'number') {
    // Excel time-of-day fraction (e.g. 0.2916 = 7:00)
    if (v > 0 && v < 1) {
      const total = Math.round(v * 24 * 60);
      return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
    }
    return String(v);
  }
  return v.replace(/\s+/g, ' ').trim();
}

function to24(h: number, m: number, ampm: string | undefined, notBefore: number): number {
  let hour = h;
  const mer = ampm?.toLowerCase().replace(/\./g, '');
  if (mer === 'pm' && hour < 12) hour += 12;
  else if (mer === 'am' && hour === 12) hour = 0;
  else if (!mer && hour >= 1 && hour <= 6) hour += 12; // school-day convention: 1:00–6:59 = PM
  let mins = hour * 60 + m;
  if (!mer && mins < notBefore && mins + 720 < 24 * 60) mins += 720;
  return mins;
}

export function minutesToHHMM(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

/** Normalize a room / name for matching */
export function normKey(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

type Item = { text: string; startSlot: number; endSlot: number };

export function parseFacultyProgram(sheet: RawSheet): ParsedProgram {
  const get = (r: number, c: number) => cellText(sheet.cells.get(`${r},${c}`));
  const result: ParsedProgram = {
    sheetName: sheet.name,
    instructorName: '',
    schoolYear: '',
    semester: '',
    classes: [],
  };

  // Merge lookup: cell → its merge range
  const mergeAt = new Map<string, RawSheet['merges'][number]>();
  for (const mg of sheet.merges) {
    for (let r = mg.r1; r <= mg.r2; r++) {
      for (let c = mg.c1; c <= mg.c2; c++) mergeAt.set(`${r},${c}`, mg);
    }
  }

  const valueRightOf = (r: number, c: number): string => {
    // "Instructor: NAME" in one cell
    const own = get(r, c);
    const colon = own.indexOf(':');
    if (colon >= 0 && own.slice(colon + 1).trim()) return own.slice(colon + 1).trim();
    for (let cc = c + 1; cc <= Math.min(sheet.maxCol, c + 8); cc++) {
      const t = get(r, cc);
      if (t) return t;
    }
    return '';
  };

  // Header info + day header row
  let headerRow = -1;
  const dayCols = new Map<number, string>();
  const scanRows = Math.min(sheet.maxRow, 80);
  const scanCols = Math.min(sheet.maxCol, 20);

  for (let r = 1; r <= scanRows; r++) {
    for (let c = 1; c <= scanCols; c++) {
      const t = get(r, c);
      if (!t) continue;
      const low = t.toLowerCase();
      if (!result.instructorName && /^(instructor|faculty|name of (faculty|instructor)|teacher)\b/.test(low)) {
        result.instructorName = valueRightOf(r, c);
      } else if (!result.schoolYear && /^(school\s*year|s\.?y\.?|academic\s*year)\b/.test(low)) {
        result.schoolYear = valueRightOf(r, c);
      } else if (!result.semester && /^semester\b/.test(low)) {
        result.semester = valueRightOf(r, c);
      }
    }
    if (headerRow < 0) {
      const found = new Map<number, string>();
      for (let c = 1; c <= scanCols; c++) {
        const day = DAY_NAMES[get(r, c).toLowerCase().replace(/[^a-z]/g, '')];
        if (day) found.set(c, day);
      }
      if (found.size >= 3) {
        headerRow = r;
        found.forEach((d, c) => dayCols.set(c, d));
      }
    }
  }

  if (headerRow < 0) {
    result.error = 'Could not find the day header row (Monday, Tuesday, …).';
    return result;
  }
  if (!result.instructorName) result.instructorName = sheet.name;

  // Time column = the column with the most time ranges below the header (left of the first day)
  const firstDayCol = Math.min(...dayCols.keys());
  let timeCol = -1;
  let best = 0;
  for (let c = 1; c < firstDayCol; c++) {
    let count = 0;
    for (let r = headerRow + 1; r <= sheet.maxRow; r++) if (TIME_RANGE_RE.test(get(r, c))) count++;
    if (count > best) {
      best = count;
      timeCol = c;
    }
  }
  if (timeCol < 0) {
    result.error = 'Could not find the time column (e.g. "7:00-7:30").';
    return result;
  }

  // Slots
  const slots: { row: number; start: number; end: number }[] = [];
  let prevEnd = 0;
  for (let r = headerRow + 1; r <= sheet.maxRow; r++) {
    const m = TIME_RANGE_RE.exec(get(r, timeCol));
    if (!m) continue;
    const start = to24(+m[1], +m[2], m[3], prevEnd);
    const end = to24(+m[4], +m[5], m[6], start + 1);
    slots.push({ row: r, start, end });
    prevEnd = end;
  }
  if (slots.length === 0) {
    result.error = 'No time slots found under the header.';
    return result;
  }
  const slotOfRow = new Map(slots.map((s, i) => [s.row, i]));

  // Walk each day column
  for (const [col, day] of [...dayCols.entries()].sort((a, b) => a[0] - b[0])) {
    const runs: Item[][] = [];
    let run: Item[] = [];
    const flush = () => {
      if (run.length) runs.push(run);
      run = [];
    };

    for (let i = 0; i < slots.length; i++) {
      const r = slots[i].row;
      const mg = mergeAt.get(`${r},${col}`);
      let text = '';
      let endSlot = i;

      if (mg) {
        if (mg.r1 !== r) continue; // covered by a vertical merge that started above
        text = cellText(sheet.cells.get(`${mg.r1},${mg.c1}`)); // horizontal merge → copy value
        // extend to last slot row covered by the merge
        for (let rr = mg.r2; rr > r; rr--) {
          const idx = slotOfRow.get(rr);
          if (idx != null) {
            endSlot = idx;
            break;
          }
        }
      } else {
        text = get(r, col);
      }

      if (!text) {
        flush();
        continue;
      }
      if (LABEL_RE.test(text)) {
        flush();
        i = endSlot;
        continue;
      }
      run.push({ text, startSlot: i, endSlot });
      i = endSlot;
    }
    flush();

    // Each class = 3 cells: subject, section, room (section/room order may vary)
    for (const items of runs) {
      for (let g = 0; g < items.length; g += 3) {
        const group = items.slice(g, g + 3);
        const subject = group[0].text;
        const rest = group.slice(1).map((x) => x.text);
        const sectionIdx = rest.findIndex((t) => SECTION_RE.test(t));
        const section = sectionIdx >= 0 ? rest[sectionIdx] : '';
        const roomParts = rest.filter((_, i) => i !== sectionIdx);
        const room = roomParts.join(' ').trim() || 'TBA';

        const start = slots[group[0].startSlot].start;
        const end = slots[group[group.length - 1].endSlot].end;

        let warning: string | undefined;
        if (group.length < 3) warning = 'Incomplete block — check subject/section/room.';
        else if (!section) warning = 'No section detected — check this block.';

        result.classes.push({
          key: `${sheet.name}|${day}|${start}|${g}`,
          day,
          startTime: minutesToHHMM(start),
          endTime: minutesToHHMM(end),
          subjectCode: subject,
          section,
          room,
          rawCells: group.map((x) => x.text),
          warning,
        });
      }
    }
  }

  if (result.classes.length === 0 && !result.error) {
    result.error = 'No classes found in this sheet.';
  }
  return result;
}

export function parseWorkbook(bytes: Uint8Array): ParsedProgram[] {
  return readWorkbook(bytes).map(parseFacultyProgram);
}

// ─── 3. Matching helpers ────────────────────────────────────────────────────

const TITLES = new Set([
  'mr', 'ms', 'mrs', 'miss', 'dr', 'prof', 'engr', 'sir', 'maam', 'madam', 'atty', 'arch',
  'mit', 'dit', 'mba', 'phd', 'edd', 'mm', 'msit', 'mscs', 'lpt', 'rce', 'jr', 'sr', 'ii', 'iii',
]);

function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !TITLES.has(t)); // drops initials like "S."
}

/** Best profile for a name written like "MS. ANGELICA S. DAGAL". */
export function matchFaculty(name: string, faculty: Profile[]): Profile | null {
  const want = nameTokens(name);
  if (want.length === 0) return null;
  let bestProfile: Profile | null = null;
  let bestScore = 0;

  for (const p of faculty) {
    const have = nameTokens([p.name, p.first_name, p.last_name].filter(Boolean).join(' '));
    if (have.length === 0) continue;
    const overlap = want.filter((t) => have.includes(t)).length;
    if (overlap === 0) continue;
    // surname match matters most (last token in the sheet)
    const surname = want[want.length - 1];
    let score = overlap / Math.max(want.length, have.length);
    if (have.includes(surname)) score += 0.5;
    if (score > bestScore) {
      bestScore = score;
      bestProfile = p;
    }
  }
  return bestScore >= 0.6 ? bestProfile : null;
}

const ROOM_MAP_KEY = 'scheduleImport.roomMap.v1';

export async function loadSavedRoomMap(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(ROOM_MAP_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export async function saveRoomMap(map: Record<string, string>): Promise<void> {
  try {
    const existing = await loadSavedRoomMap();
    const clean: Record<string, string> = { ...existing };
    for (const [k, v] of Object.entries(map)) if (v !== ROOM_NEW_LAB) clean[k] = v;
    await AsyncStorage.setItem(ROOM_MAP_KEY, JSON.stringify(clean));
  } catch {
    // not critical
  }
}

/** Initial room → lab guess: saved choice, then name/location match, TBA → skip. */
export function guessRoomMapping(
  rooms: string[],
  labs: Laboratory[],
  saved: Record<string, string>,
): Record<string, string> {
  const out: Record<string, string> = {};
  const labIds = new Set(labs.map((l) => l.id));
  for (const room of rooms) {
    const key = normKey(room);
    if (saved[key] && (saved[key] === ROOM_SKIP || labIds.has(saved[key]))) {
      out[key] = saved[key];
      continue;
    }
    if (!key || key === 'TBA' || key === 'TBD') {
      out[key] = ROOM_SKIP;
      continue;
    }
    const lab = labs.find(
      (l) => normKey(l.name) === key || (l.location && normKey(l.location) === key) ||
        normKey(l.name).includes(key) || key.includes(normKey(l.name)),
    );
    out[key] = lab ? lab.id : ROOM_SKIP;
  }
  return out;
}

// ─── 4. Validation + import ─────────────────────────────────────────────────

const OPEN_MIN = 7 * 60;
const CLOSE_MIN = 19 * 60;
const ALLOWED_DAYS = new Set(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']);

function hhmmToMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export type ClassCheck = { ok: boolean; reason?: string };

/**
 * Checks one class against operating hours and existing schedules in the same lab.
 * `existing` should already exclude the instructor's old schedules when they will be replaced.
 */
export function checkClass(
  c: ParsedClass,
  labId: string | undefined,
  existing: ScheduleWithRelations[],
): ClassCheck {
  if (!ALLOWED_DAYS.has(c.day)) return { ok: false, reason: `${c.day} classes are not supported.` };
  const s = hhmmToMin(c.startTime);
  const e = hhmmToMin(c.endTime);
  if (e <= s) return { ok: false, reason: 'End time is not after start time.' };
  if (s < OPEN_MIN || e > CLOSE_MIN) return { ok: false, reason: 'Outside lab hours (7:00 AM – 7:00 PM).' };
  if (!labId || labId === ROOM_SKIP) return { ok: false, reason: 'Room not mapped to a laboratory.' };
  if (labId === ROOM_NEW_LAB) return { ok: true };

  for (const x of existing) {
    if (x.laboratory_id !== labId || x.day_of_week !== c.day) continue;
    const xs = hhmmToMin(x.start_time);
    const xe = hhmmToMin(x.end_time);
    if (s < xe && e > xs) {
      return {
        ok: false,
        reason: `Lab already booked ${x.start_time.slice(0, 5)}–${x.end_time.slice(0, 5)} by ${x.profiles?.name ?? 'another instructor'}.`,
      };
    }
  }
  return { ok: true };
}

function isMissingDetailColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const msg = error.message || '';
  return (
    (error.code === 'PGRST204' || error.code === '42703') &&
    /(subject_code|section|room)/.test(msg)
  );
}

export async function importSchedules(
  plan: ImportPlan,
  labs: Laboratory[],
  rooms: { key: string; label: string }[],
): Promise<ImportResult> {
  const roomMap = { ...plan.roomMap };
  const createdLabs: string[] = [];

  // Create any "new laboratory" rooms first
  for (const { key, label } of rooms) {
    if (roomMap[key] !== ROOM_NEW_LAB) continue;
    const used = plan.sheets.some((sh) => sh.classes.some((c) => normKey(c.room) === key));
    if (!used) continue;
    const existing = labs.find((l) => normKey(l.name) === key);
    if (existing) {
      roomMap[key] = existing.id;
      continue;
    }
    const { data, error } = await supabase
      .from('laboratories')
      .insert({ name: label })
      .select('id')
      .single();
    if (error) throw new Error(`Could not create laboratory "${label}": ${error.message}`);
    roomMap[key] = data.id;
    createdLabs.push(label);
  }
  await saveRoomMap(roomMap);

  // Build rows
  const rows = plan.sheets.flatMap((sh) =>
    sh.classes
      .filter((c) => {
        const lab = roomMap[normKey(c.room)];
        return lab && lab !== ROOM_SKIP && lab !== ROOM_NEW_LAB;
      })
      .map((c) => ({
        faculty_id: sh.facultyId,
        laboratory_id: roomMap[normKey(c.room)],
        day_of_week: c.day,
        start_time: `${c.startTime}:00`,
        end_time: `${c.endTime}:00`,
        subject_code: c.subjectCode || null,
        section: c.section || null,
        room: c.room || null,
      })),
  );

  // Remember old schedules to replace (deleted only AFTER the insert succeeds)
  const replaceIds = plan.sheets.filter((s) => s.replaceExisting).map((s) => s.facultyId);
  let oldIds: string[] = [];
  if (replaceIds.length) {
    const { data, error } = await supabase.from('schedules').select('id').in('faculty_id', replaceIds);
    if (error) throw new Error(`Could not read existing schedules: ${error.message}`);
    oldIds = (data ?? []).map((r) => r.id);
  }

  let detailsSaved = true;
  if (rows.length) {
    let { error } = await supabase.from('schedules').insert(rows as any);
    if (error && isMissingDetailColumn(error)) {
      // DB not migrated yet → insert without subject/section/room
      detailsSaved = false;
      const basic = rows.map(({ subject_code, section, room, ...rest }) => rest);
      ({ error } = await supabase.from('schedules').insert(basic));
    }
    if (error) throw new Error(`Could not save schedules: ${error.message}`);
  }

  if (oldIds.length) {
    const { error } = await supabase.from('schedules').delete().in('id', oldIds);
    if (error) throw new Error(`New schedules saved, but old ones could not be removed: ${error.message}`);
  }

  return { inserted: rows.length, replaced: oldIds.length, createdLabs, detailsSaved };
}

// ─── File loading (web + native) ────────────────────────────────────────────

export async function readPickedFile(asset: { uri: string; file?: Blob | null }): Promise<Uint8Array> {
  if (asset.file) return new Uint8Array(await asset.file.arrayBuffer());
  const { File: FSFile } = await import('expo-file-system');
  const f = new FSFile(asset.uri);
  return new Uint8Array(await f.arrayBuffer());
}
