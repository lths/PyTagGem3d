/**
 * batch-processor.js
 * Parses CSV input and returns an array of tag parameter objects.
 *
 * Supported CSV columns (header row required):
 *   name            – tag identifier, used as filename (REQUIRED)
 *   line1           – top text line (defaults to name)
 *   line2           – bottom text line
 *   width           – tag width mm
 *   height          – tag height mm
 *   thickness       – tag thickness mm
 *   corner_radius   – corner radius mm
 *   hole_enabled    – true/false/1/0
 *   hole_diameter   – hole diameter mm
 *   hole_margin     – distance from hole center to tag edge mm
 *   font_size       – text size mm
 *   text_depth      – emboss/engrave depth mm
 *   text_style      – "emboss" or "engrave"
 *
 * Missing / blank columns fall back to the provided UI defaults.
 */

// ─────────────────────────────────────────────
//  CSV parsing
// ─────────────────────────────────────────────

/** Split a CSV line respecting double-quoted fields containing commas. */
function splitCSVLine(line) {
  const result = [];
  let cur = '', inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') { inQuote = !inQuote; continue; }
    if (ch === ',' && !inQuote) { result.push(cur); cur = ''; continue; }
    cur += ch;
  }
  result.push(cur);
  return result;
}

/** Parse full CSV text → array of header-keyed row objects. */
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length < 2) {
    throw new Error('CSV must have a header row and at least one data row.');
  }

  // Normalise headers: trim whitespace AND lowercase
  const headers = splitCSVLine(lines[0]).map(h => h.trim().toLowerCase());

  return lines.slice(1).map((line, idx) => {
    const vals = splitCSVLine(line);
    const row  = {};
    headers.forEach((h, i) => {
      // Trim all values to prevent whitespace mismatches
      row[h] = (vals[i] ?? '').trim();
    });
    if (!row.name) {
      throw new Error(`Row ${idx + 2}: missing required "name" value.`);
    }
    return row;
  });
}

// ─────────────────────────────────────────────
//  Row → params conversion
// ─────────────────────────────────────────────

function rowToParams(row, defaults) {
  /** Parse number; return fallback if blank or NaN. */
  const num = (key, fallback) => {
    const v = parseFloat(row[key]);
    return isNaN(v) ? fallback : v;
  };

  /** Parse boolean; return fallback if blank. */
  const bool = (key, fallback) => {
    const v = row[key];
    if (v === undefined || v === '') return fallback;
    const lv = v.toLowerCase();
    return lv !== 'false' && lv !== '0' && lv !== 'no';
  };

  /** Use row value if non-empty, else fallback string. */
  const str = (key, fallback) => (row[key] !== undefined && row[key] !== '') ? row[key] : fallback;

  // Validate text_style value
  const rawStyle  = str('text_style', defaults.textStyle).toLowerCase();
  const textStyle = ['emboss', 'engrave'].includes(rawStyle) ? rawStyle : defaults.textStyle;

  // Validate hole_layout value
  const rawLayout  = str('hole_layout', defaults.holeLayout).toLowerCase();
  const holeLayout = ['top-center', 'left-right', 'top-corners'].includes(rawLayout)
    ? rawLayout : defaults.holeLayout;

  return {
    _name:        row.name,
    width:        num ('width',         defaults.width),
    height:       num ('height',        defaults.height),
    thickness:    num ('thickness',     defaults.thickness),
    cornerRadius: num ('corner_radius', defaults.cornerRadius),
    holeEnabled:  bool('hole_enabled',  defaults.holeEnabled),
    holeLayout,
    holeDiameter: num ('hole_diameter', defaults.holeDiameter),
    holeMargin:   num ('hole_margin',   defaults.holeMargin),
    textLine1:    str ('line1',         row.name),
    textLine2:    str ('line2',         defaults.textLine2),
    fontSize:     num ('font_size',     defaults.fontSize),
    textDepth:    num ('text_depth',    defaults.textDepth),
    textStyle,
    mirrorText:   bool('mirror_text',   defaults.mirrorText),
  };
}

// ─────────────────────────────────────────────
//  Public API
// ─────────────────────────────────────────────

/**
 * Parse CSV text and return tag parameter objects.
 * @param {string} csvText
 * @param {object} defaults  current UI params (fallback for missing columns)
 * @returns {{ items: object[], errors: string[] }}
 */
export function parseBatchCSV(csvText, defaults) {
  let rows = [];
  try {
    rows = parseCSV(csvText);
  } catch (e) {
    return { items: [], errors: [e.message] };
  }

  const items  = [];
  const errors = [];

  for (const row of rows) {
    try {
      items.push(rowToParams(row, defaults));
    } catch (e) {
      errors.push(e.message);
    }
  }

  return { items, errors };
}
