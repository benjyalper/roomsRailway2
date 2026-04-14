// utils/pdf-import.js  –  ESM
// Parses a Hebrew weekly-schedule PDF (grid format) into flat booking entries.
// Uses pdfjs-dist with x/y coordinates to reconstruct table columns reliably.

import { createRequire } from 'module';
import moment from 'moment';

const require = createRequire(import.meta.url);

// Hebrew day-of-week label → JS day index (0=Sun … 4=Thu)
const DAY_LABEL_TO_DOW = { "א'": 0, "ב'": 1, "ג'": 2, "ד'": 3, "ה'": 4 };

const TIME_RE = /^(\d{1,2})[.:](\d{2})$/;

// ─── Public API ───────────────────────────────────────────────────────────────
/**
 * parsePdfSchedule(input, filename?)
 *   input    – Buffer (from multer) or absolute file path string
 *   filename – original filename, used to extract the start date
 *   returns  – Array of { date, startTime, endTime, roomNumber, names }
 */
export async function parsePdfSchedule(input, filename = '') {
    const pdfjsLib = require('pdfjs-dist/legacy/build/pdf.js');

    const data = Buffer.isBuffer(input)
        ? new Uint8Array(input)
        : new Uint8Array(require('fs').readFileSync(input));

    const pdf    = await pdfjsLib.getDocument({ data }).promise;
    const startDate = extractStartDate(filename) || moment().format('YYYY-MM-DD');

    const weeklySlots = []; // { dow, startTime, endTime, roomNumber, names }

    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const tc   = await page.getTextContent();

        const items = tc.items
            .filter(i => i.str.trim())
            .map(i => ({
                text: normalizeText(i.str.trim()),
                x:   i.transform[4],
                y:   i.transform[5]
            }));

        // ── 1. Detect day-of-week ──────────────────────────────────────────
        const titleText = items.filter(i => i.y > 545).map(i => i.text).join(' ');
        const dayMatch  = titleText.match(/יום\s+([א-ה]')/);
        if (!dayMatch) continue;
        const dow = DAY_LABEL_TO_DOW[dayMatch[1]];
        if (dow === undefined) continue;

        // ── 2. Detect room columns from header digit items ─────────────────
        const headerItems = items.filter(i => i.y > 480 && i.y <= 545);
        const columns     = detectColumns(headerItems);
        if (!columns.length) continue;

        // Sort columns right-to-left (descending x)
        columns.sort((a, b) => b.x - a.x);

        // Compute midpoint boundaries between adjacent columns
        const boundaries = [Infinity];
        for (let ci = 0; ci < columns.length - 1; ci++) {
            boundaries.push((columns[ci].x + columns[ci + 1].x) / 2);
        }
        boundaries.push(-Infinity);

        // ── 3. Detect שעה column x (to filter real time markers) ───────────
        const shaaItem = headerItems.find(i => i.text === 'שעה');
        const shaaX    = shaaItem ? shaaItem.x : columns[0].x + 70;

        // ── 4. Detect time-slot markers (must be in the שעה column zone) ───
        const rawTimes = items
            .filter(i => TIME_RE.test(i.text) && i.y <= 480 && i.x >= shaaX - 40)
            .sort((a, b) => b.y - a.y);  // top → bottom (high y → low y in PDF coords)

        // Merge adjacent close-y time pairs like "7:30" + "8:30" into one slot
        const timeSlots = mergeCloseTimes(rawTimes);

        // ── 5. For each time slot, extract room assignments ────────────────
        for (let ti = 0; ti < timeSlots.length; ti++) {
            const slot     = timeSlots[ti];
            const nextSlot = timeSlots[ti + 1];

            const bandTop = slot.y    + 25;
            const bandBot = nextSlot  ? nextSlot.y - 2 : slot.y - 55;

            let bandItems = items.filter(i =>
                i.y <= bandTop && i.y >= bandBot &&
                !TIME_RE.test(i.text) &&
                i.y <= 480 &&
                i.x <= shaaX + 10           // exclude anything in שעה column area
            );

            if (!bandItems.length) continue;

            // Step A: merge split Hebrew words (same y ±3px, x-gap < 15px)
            bandItems = mergeSplitWords(bandItems);

            // Step B: assign each item to the nearest column via boundaries
            const colMap = {}; // colLabel → Set<string>
            for (const item of bandItems) {
                if (item.text.length === 0) continue;
                let colIdx = columns.length - 1;
                for (let ci = 0; ci < columns.length; ci++) {
                    if (item.x >= boundaries[ci + 1] && item.x < boundaries[ci]) {
                        colIdx = ci;
                        break;
                    }
                }
                const label = columns[colIdx].label;
                if (!colMap[label]) colMap[label] = new Set();
                colMap[label].add(item.text);
            }

            // Step C: build entries
            for (const [label, textSet] of Object.entries(colMap)) {
                const names = [...textSet]
                    .filter(t => t.length > 1 || /[\u0590-\u05FFa-zA-Z0-9]/.test(t))
                    .join(' ')
                    .replace(/\s+/g, ' ')
                    .trim();
                if (!names) continue;

                const roomNumber = label.replace(/^חדר\s*/, '').trim();

                weeklySlots.push({
                    dow,
                    startTime:  slot.startTime,
                    endTime:    slot.endTime,
                    roomNumber,
                    names
                });
            }
        }
    }

    // ── 6. Expand weekly pattern → 13 actual weeks (≈3 months) ──────────────
    return expandToWeeks(weeklySlots, startDate, 13);
}

// ─── Column detection ─────────────────────────────────────────────────────────
function detectColumns(headerItems) {
    const columns = [];

    // Numbered rooms: any item whose text is a 1-or-2-digit number
    for (const item of headerItems) {
        if (/^\d{1,2}$/.test(item.text)) {
            columns.push({ x: item.x, label: `חדר ${item.text}` });
        }
    }

    // Named (non-numbered) rooms: "חדר" items without a nearby digit column
    for (const ci of headerItems.filter(i => i.text === 'חדר')) {
        const hasNearbyDigitCol = columns.some(c => Math.abs(c.x - ci.x) < 55);
        if (hasNearbyDigitCol) continue;

        // Find nearby descriptive words (to the left of this "חדר" item)
        const nearby = headerItems.filter(n =>
            n !== ci &&
            Math.abs(n.y - ci.y) < 22 &&
            n.x < ci.x &&
            (ci.x - n.x) < 110 &&
            !/^\d{1,2}$/.test(n.text) &&
            n.text !== 'חדר' &&
            n.text !== 'שעה'
        );
        const label = nearby.map(n => n.text).join(' ').trim() || String(Math.round(ci.x));
        columns.push({ x: ci.x, label: `חדר ${label}` });
    }

    return columns;
}

// ─── Merge adjacent close time items (e.g. "7:30" + "8:30" range header) ────
function mergeCloseTimes(rawTimes) {
    const merged = [];
    let i = 0;
    while (i < rawTimes.length) {
        const cur  = rawTimes[i];
        const next = rawTimes[i + 1];
        const parseT = t => {
            const [, h, m] = t.text.match(TIME_RE);
            return `${h.padStart(2, '0')}:${m}:00`;
        };

        if (next && (cur.y - next.y) < 18) {
            // Treat as a start–end range label; combine into one slot
            merged.push({
                startTime: parseT(cur),
                endTime:   parseT(next),
                y:         cur.y
            });
            i += 2;
        } else {
            // Normal slot: endTime = start of next slot (or +1h as fallback)
            const nextReal = rawTimes[i + 1];
            merged.push({
                startTime: parseT(cur),
                endTime:   nextReal
                    ? parseT(nextReal)
                    : (() => {
                          const [, h, m] = cur.text.match(TIME_RE);
                          return `${(parseInt(h, 10) + 1).toString().padStart(2, '0')}:${m}:00`;
                      })(),
                y: cur.y
            });
            i++;
        }
    }
    return merged;
}

// ─── Merge split Hebrew words ─────────────────────────────────────────────────
// Items at the same y (±3px) whose VISUAL gap is < 8px are parts of a split word.
// "Visual gap" = distance between the right edge of the left item and left edge
// of the right item.  Right edge is estimated as x + text.length * CHAR_WIDTH.
const CHAR_WIDTH = 7; // approximate px per Hebrew character at typical PDF font size

function mergeSplitWords(items) {
    // Group into y-lines (within 3px)
    const lines = [];
    for (const item of items) {
        const line = lines.find(l => Math.abs(l.y - item.y) < 3);
        if (line) line.items.push(item);
        else      lines.push({ y: item.y, items: [item] });
    }

    const result = [];
    for (const line of lines) {
        // Sort RIGHT-to-LEFT within each line (descending x for Hebrew)
        line.items.sort((a, b) => b.x - a.x);

        let current = null;
        for (const item of line.items) {
            if (!current) { current = { ...item }; continue; }
            // Visual gap = space between right-edge of `item` and left-edge of `current`
            // (current is to the RIGHT in screen coords, so current.x > item.x)
            const visualGap = current.x - (item.x + item.text.length * CHAR_WIDTH);
            if (visualGap < 8) {
                // Fuse: current (higher x) is read FIRST in Hebrew → current.text + item.text
                current.text = current.text + item.text;
            } else {
                result.push(current);
                current = { ...item };
            }
        }
        if (current) result.push(current);
    }
    return result;
}

// ─── Expand weekly slots to N concrete weeks ──────────────────────────────────
function expandToWeeks(slots, startDateStr, numWeeks) {
    const start   = moment(startDateStr, 'YYYY-MM-DD');
    const entries = [];

    for (const slot of slots) {
        // Find first occurrence of this day-of-week on or after startDate
        let firstDate = start.clone();
        while (firstDate.day() !== slot.dow) firstDate.add(1, 'day');

        for (let w = 0; w < numWeeks; w++) {
            entries.push({
                date:       firstDate.clone().add(w, 'weeks').format('YYYY-MM-DD'),
                startTime:  slot.startTime,
                endTime:    slot.endTime,
                roomNumber: slot.roomNumber,
                names:      slot.names,
                color:      nameToColor(slot.names)
            });
        }
    }
    return entries;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function extractStartDate(filename) {
    const m = filename.match(/(\d{2})\.(\d{2})\.(\d{4})/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function normalizeText(str) {
    // Normalise Hebrew punctuation variants → consistent characters
    return str
        .replace(/[""״]/g, '"')
        .replace(/\s+/g, ' ')
        .trim();
}

// ─── Therapist colour assignment ──────────────────────────────────────────────
// 20 visually distinct, pleasant colours (not too dark/light for readability)
const PALETTE = [
    '#4e9af1', '#f4a261', '#2a9d8f', '#e76f51', '#8ecae6',
    '#a8dadc', '#f6c90e', '#b5838d', '#6d6875', '#52b788',
    '#ff9f1c', '#cbf3f0', '#e9c46a', '#457b9d', '#f1faee',
    '#d4a5a5', '#9b5de5', '#00bbf9', '#fee440', '#00f5d4'
];

// Deterministic hash → same name always gets same colour across imports
function nameToColor(name) {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
        hash = Math.imul(31, hash) + name.charCodeAt(i) | 0;
    }
    return PALETTE[Math.abs(hash) % PALETTE.length];
}
