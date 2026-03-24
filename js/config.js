/**
 * config.js — Default tag model parameters
 *
 * Edit this file to change the starting values that appear in the UI
 * when the app first loads.
 */

export const DEFAULT_PARAMS = {
  // ── Dimensions ───────────────────────────────
  width:          76,       // mm
  height:         19,       // mm
  thickness:       3,       // mm
  cornerRadius:    6,       // mm

  // ── Edge treatment ───────────────────────────
  edgeType:     'none',     // 'none' | 'chamfer' | 'fillet'
  edgeSize:      0.5,       // mm (used when edgeType is not 'none')

  // ── Mounting hole ────────────────────────────
  holeEnabled:   true,
  holeLayout:   'left-right',  // 'top-center' | 'left-right' | 'top-corners'
  holeDiameter:  5,         // mm
  holeMargin:    6,         // mm (hole-center to nearest edge)

  // ── Text ─────────────────────────────────────
  textLine1:    'VALVE-001',
  textLine2:    '',
  fontSize:      8,         // mm
  textDepth:     0.8,       // mm
  textStyle:    'engrave',   // 'emboss' | 'engrave'
  mirrorText:    true,

  // ── Export ───────────────────────────────────
  filenamePrefix: 'tag',
};
