/**
 * tag-generator.js
 *
 * Geometry strategy:
 *  - PREVIEW: never uses CSG. Engrave text is shown as thin dark geometry
 *    sitting on the surface (polygonOffset keeps it visible over the body).
 *    Always fast and always works regardless of CSG library.
 *
 *  - EXPORT (buildTagForExport):
 *      emboss  → mergeGeometries(body + text)
 *      engrave → CSG SUBTRACTION with a "cutter" text that extends well
 *                beyond the surface for a robust boolean result.
 *
 * Hole layouts: top-center | left-right | top-corners
 */

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { Evaluator, SUBTRACTION } from 'three-bvh-csg';

const _csgEvaluator = new Evaluator();
_csgEvaluator.useGroups = false;
const _csgMat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide });

// ─────────────────────────────────────────────
//  Validation
// ─────────────────────────────────────────────

export function validateParams(params, textGeos = []) {
  const warnings = [];
  const { width, height, thickness, holeEnabled, holeDiameter, holeMargin,
          holeLayout, textDepth, fontSize } = params;

  if (holeEnabled) {
    const r = holeDiameter / 2;
    if (holeLayout === 'left-right') {
      if (holeDiameter >= height - 4)
        warnings.push(`Hole diameter (${holeDiameter}mm) is too large for tag height (${height}mm).`);
      if (holeMargin < r + 1)
        warnings.push(`Hole margin too small — hole extends outside the tag edge.`);
    } else {
      if (holeDiameter >= Math.min(width, height) - 4)
        warnings.push(`Hole diameter (${holeDiameter}mm) is too large for the tag size.`);
      const holeCenterY = height / 2 - Math.max(holeMargin, r + 0.5);
      if (holeCenterY + r > height / 2)
        warnings.push(`Hole extends above tag boundary — increase Hole Margin.`);
    }
  }

  if ((edgeType === 'chamfer' || edgeType === 'fillet') && edgeSize >= thickness / 2)
    warnings.push(`Edge size (${edgeSize}mm) must be less than half the thickness (${(thickness/2).toFixed(1)}mm).`);

  if (textDepth >= thickness)
    warnings.push(`Text depth (${textDepth}mm) must be less than tag thickness (${thickness}mm).`);
  if (fontSize > height * 0.6)
    warnings.push(`Font size (${fontSize}mm) may be too large for tag height (${height}mm).`);

  for (const geo of textGeos) {
    geo.computeBoundingBox();
    const bb = geo.boundingBox;
    if (!bb) continue;
    const tw = bb.max.x - bb.min.x;
    if (tw > width * 0.92)
      warnings.push(`Text is wider than the tag (${tw.toFixed(1)} mm vs ${(width * 0.92).toFixed(1)} mm available) — reduce font size or shorten text.`);
  }

  return warnings;
}

// ─────────────────────────────────────────────
//  Shape helpers
// ─────────────────────────────────────────────

function roundedRectShape(w, h, r) {
  r = Math.max(0, Math.min(r, w / 2 - 0.01, h / 2 - 0.01));
  const shape = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  if (r > 0) {
    shape.moveTo(x + r, y);
    shape.lineTo(x + w - r, y);
    shape.quadraticCurveTo(x + w, y, x + w, y + r);
    shape.lineTo(x + w, y + h - r);
    shape.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    shape.lineTo(x + r, y + h);
    shape.quadraticCurveTo(x, y + h, x, y + h - r);
    shape.lineTo(x, y + r);
    shape.quadraticCurveTo(x, y, x + r, y);
  } else {
    shape.moveTo(x, y); shape.lineTo(x + w, y);
    shape.lineTo(x + w, y + h); shape.lineTo(x, y + h);
    shape.closePath();
  }
  return shape;
}

function addCircleHole(shape, cx, cy, r) {
  const hole = new THREE.Path();
  hole.absarc(cx, cy, r, 0, Math.PI * 2, true);
  shape.holes.push(hole);
}

// ─────────────────────────────────────────────
//  Tag body
// ─────────────────────────────────────────────

export function buildTagBody(params) {
  const { width, height, thickness, cornerRadius,
          holeEnabled, holeDiameter, holeMargin, holeLayout,
          edgeType, edgeSize } = params;

  const shape = roundedRectShape(width, height, cornerRadius);

  if (holeEnabled && holeDiameter > 0) {
    const r = Math.min(holeDiameter / 2, Math.min(width, height) / 4);
    const margin = Math.max(holeMargin, r + 0.5);

    if (holeLayout === 'left-right') {
      addCircleHole(shape,  width / 2 - margin, 0, r);
      addCircleHole(shape, -width / 2 + margin, 0, r);
    } else if (holeLayout === 'top-corners') {
      addCircleHole(shape, -width / 2 + margin, height / 2 - margin, r);
      addCircleHole(shape,  width / 2 - margin, height / 2 - margin, r);
    } else {
      addCircleHole(shape, 0, height / 2 - margin, r);
    }
  }

  // Bevel settings for chamfer / fillet
  const useBevel  = edgeType === 'chamfer' || edgeType === 'fillet';
  const bevelSize = useBevel ? Math.min(edgeSize, thickness / 2 - 0.05) : 0;
  const extrudeSettings = {
    depth:          thickness,
    bevelEnabled:   useBevel,
    bevelThickness: bevelSize,   // how far bevel steps in along Z (top/bottom faces)
    bevelSize:      bevelSize,   // how far bevel steps in along XY (perimeter edges)
    bevelSegments:  edgeType === 'fillet' ? 6 : 1,   // 1 = flat chamfer, 6 = smooth fillet
    steps:          1,
  };

  const geo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
  // Re-center Z so tag is symmetric about z=0
  geo.translate(0, 0, -thickness / 2);
  geo.computeVertexNormals();
  return geo;
}

// ─────────────────────────────────────────────
//  Flat-face Z helper
// ─────────────────────────────────────────────

/**
 * Returns the Z coordinate of the actual FLAT face of the tag after bevelling.
 *
 * ExtrudeGeometry with bevelThickness=b places the flat body at:
 *   front flat face: z = +thickness/2 − b   (after the -thickness/2 translate)
 *   back  flat face: z = −thickness/2 + b
 *
 * Without bevel (b=0) this collapses to ±thickness/2 as before.
 */
function getFlatFaceZ(params) {
  const { thickness, edgeType, edgeSize } = params;
  const b = (edgeType === 'chamfer' || edgeType === 'fillet')
    ? Math.min(edgeSize, thickness / 2 - 0.05)
    : 0;
  return { front: thickness / 2 - b, back: -(thickness / 2 - b), bevel: b };
}

// ─────────────────────────────────────────────
//  Text area vertical centering (avoids top holes)
// ─────────────────────────────────────────────

function getTextAreaCenterY(params) {
  const { height, holeEnabled, holeDiameter, holeMargin, holeLayout } = params;
  if (!holeEnabled || holeLayout === 'left-right') return 0;

  const r            = holeDiameter / 2;
  const margin       = Math.max(holeMargin, r + 0.5);
  const holeCenterY  = height / 2 - margin;
  const holeBottomY  = holeCenterY - r;
  const safeTop      = holeBottomY - 1.5;
  const safeBottom   = -height / 2 + 1.5;

  if (safeTop <= safeBottom) return 0;
  return (safeTop + safeBottom) / 2;
}

// ─────────────────────────────────────────────
//  Low-level: raw centered text geometry
// ─────────────────────────────────────────────

/**
 * Create a TextGeometry centered at XY origin, extruding +Z.
 * Returns { geo, width, height } or null.
 */
function makeRawText(text, font, fontSize, depth) {
  if (!text || !font) return null;
  const geo = new TextGeometry(text, {
    font, size: fontSize, depth,
    curveSegments: 5, bevelEnabled: false,
  });
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const tw = bb.max.x - bb.min.x;
  const th = bb.max.y - bb.min.y;
  geo.translate(-tw / 2, -th / 2, 0);   // center at origin
  return { geo, tw, th };
}

// ─────────────────────────────────────────────
//  PREVIEW text  (never uses CSG)
// ─────────────────────────────────────────────

/**
 * Build display-only text geometry for the 3D preview.
 *
 * Emboss → raised geometry proud of the face (safeDepth above surface).
 * Engrave → recessed geometry going INTO the face (safeDepth below surface).
 *   The top face of the engraved text sits exactly at the tag surface, so in
 *   wireframe you see the full letter depth, and in solid mode polygonOffset
 *   (on the material in app.js) renders the dark top face over the body surface.
 *
 *  Front face Z conventions (tag body: z ∈ [−t/2, +t/2]):
 *    emboss  : [+t/2,           +t/2 + depth]   proud of front
 *    engrave : [+t/2 − depth,   +t/2]            recessed from front
 *
 *  Back face (mirror X only — keeps +Z extrusion direction but going inward):
 *    emboss  : scale(-1,1,-1) → [−t/2 − depth, −t/2]  proud of back
 *    engrave : scale(-1,1, 1) → [−t/2,          −t/2 + depth]  recessed from back
 */
function buildPreviewText(text, font, params, yOffset, face = 'front') {
  const { fontSize, textDepth, textStyle, thickness } = params;
  const safeDepth = Math.min(Math.max(textDepth, 0.1), thickness - 0.1);
  const { front: fz, back: bz } = getFlatFaceZ(params);

  const raw = makeRawText(text, font, fontSize, safeDepth);
  if (!raw) return null;
  const { geo } = raw;
  geo.translate(0, yOffset, 0);

  if (face === 'back') {
    if (textStyle === 'emboss') {
      geo.applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, -1));
      geo.translate(0, 0, bz);       // [bz, bz − safeDepth]  proud of back flat face
    } else {
      geo.applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1));
      geo.translate(0, 0, bz);       // [bz, bz + safeDepth]  recessed into back flat face
    }
  } else {
    if (textStyle === 'emboss') {
      geo.translate(0, 0, fz);                  // [fz, fz + safeDepth]  proud of front flat face
    } else {
      geo.translate(0, 0, fz - safeDepth);      // [fz−d, fz]  recessed from front flat face
    }
  }

  geo.computeVertexNormals();
  return geo;
}

// ─────────────────────────────────────────────
//  EXPORT text (emboss merged / engrave CSG cutter)
// ─────────────────────────────────────────────

/**
 * Build emboss text geometry for merging into the exported STL.
 * Same as preview emboss but full depth.
 */
function buildEmbossText(text, font, params, yOffset, face = 'front') {
  const { fontSize, textDepth, thickness } = params;
  const safeDepth = Math.min(Math.max(textDepth, 0.1), thickness - 0.1);
  const { front: fz, back: bz } = getFlatFaceZ(params);
  const raw = makeRawText(text, font, fontSize, safeDepth);
  if (!raw) return null;
  const { geo } = raw;
  geo.translate(0, yOffset, 0);
  if (face === 'back') {
    geo.applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, -1));
    geo.translate(0, 0, bz);
  } else {
    geo.translate(0, 0, fz);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Build engrave cutter geometry for CSG subtraction.
 *
 * The cutter extends 1.0 mm OUTSIDE the face (to guarantee surface intersection)
 * and reaches safeDepth INTO the tag. Total cutter depth = safeDepth + 1.0.
 *
 *  Front face: z range = [thickness/2 − safeDepth,  thickness/2 + 1.0]
 *  Back  face: z range = [−thickness/2 − 1.0,      −thickness/2 + safeDepth]
 */
function buildCutterText(text, font, params, yOffset, face = 'front') {
  const { fontSize, textDepth, thickness } = params;
  const safeDepth   = Math.min(Math.max(textDepth, 0.1), thickness - 0.1);
  const overshoot   = 1.0;
  const cutterDepth = safeDepth + overshoot;
  const { front: fz, back: bz } = getFlatFaceZ(params);

  const raw = makeRawText(text, font, fontSize, cutterDepth);
  if (!raw) return null;
  const { geo } = raw;
  geo.translate(0, yOffset, 0);

  if (face === 'back') {
    // Mirror X and flip Z so cutter points into tag from the back flat face
    geo.applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, -1));
    // z range: [bz + safeDepth,  bz + safeDepth − cutterDepth]
    //        = [bz + safeDepth,  bz − overshoot]  ✓ starts inside flat face, exits beyond bevel
    geo.translate(0, 0, bz + safeDepth);
  } else {
    // TextGeometry extrudes +Z, goes from z=0 to z=+cutterDepth
    // Translate so z_start = fz − safeDepth (inside the flat face)
    //   z range: [fz − safeDepth ,  fz − safeDepth + cutterDepth]
    //          = [fz − safeDepth ,  fz + overshoot]  ✓ starts inside flat face, exits beyond bevel
    geo.translate(0, 0, fz - safeDepth);
  }

  geo.computeVertexNormals();
  return geo;
}

// ─────────────────────────────────────────────
//  CSG boolean subtract
// ─────────────────────────────────────────────

function csgEngrave(bodyGeo, cutterGeos) {
  let bodyMesh = new THREE.Mesh(bodyGeo, _csgMat);
  for (const cutterGeo of cutterGeos) {
    try {
      const cutterMesh = new THREE.Mesh(cutterGeo, _csgMat);
      const result     = _csgEvaluator.evaluate(bodyMesh, cutterMesh, SUBTRACTION);
      result.geometry.computeVertexNormals();
      bodyMesh = result;
    } catch (e) {
      console.warn('CSG subtraction failed for one element:', e.message);
    }
  }
  return bodyMesh.geometry;
}

// ─────────────────────────────────────────────
//  Collect text lines for a given face
// ─────────────────────────────────────────────

function collectLines(params) {
  const { textLine1, textLine2, fontSize } = params;
  const centerY  = getTextAreaCenterY(params);
  const hasTwo   = !!(textLine1 && textLine2);
  const spacing  = hasTwo ? fontSize * 0.8 : 0;
  const lines    = [];
  if (textLine1) lines.push({ text: textLine1, yOffset: centerY + spacing });
  if (textLine2) lines.push({ text: textLine2, yOffset: centerY - spacing });
  return lines;
}

// ─────────────────────────────────────────────
//  Public API — PREVIEW
// ─────────────────────────────────────────────

/**
 * Build tag geometry for the 3D preview.
 *
 * Returns:
 *   body      – tag body BufferGeometry
 *   texts     – array of { geo, face } for display text meshes
 *   textStyle
 *   warnings
 */
export function buildTag(params, font) {
  const bodyGeo  = buildTagBody(params);
  const lines    = font ? collectLines(params) : [];
  const faces    = params.mirrorText ? ['front', 'back'] : ['front'];

  // Build preview text geos (for validation bounds & display)
  const previewGeos = [];
  for (const face of faces) {
    for (const { text, yOffset } of lines) {
      const g = buildPreviewText(text, font, params, yOffset, face);
      if (g) previewGeos.push({ geo: g, face });
    }
  }

  // Validation: use front-face first line geo for width check
  const frontGeoForValidation = previewGeos
    .filter(p => p.face === 'front')
    .map(p => p.geo);
  const warnings = validateParams(params, frontGeoForValidation);

  return {
    body: bodyGeo,
    texts: previewGeos,   // always populated (preview never uses CSG)
    textStyle: params.textStyle,
    warnings,
  };
}

// ─────────────────────────────────────────────
//  Public API — EXPORT
// ─────────────────────────────────────────────

/**
 * Build final merged/CSG geometry for STL export.
 *
 * Returns: { geometry: BufferGeometry, warnings: string[] }
 */
export function buildTagForExport(params, font) {
  const bodyGeo  = buildTagBody(params);
  const lines    = font ? collectLines(params) : [];
  const faces    = params.mirrorText ? ['front', 'back'] : ['front'];
  const warnings = validateParams(params, []);

  if (lines.length === 0 || !font) {
    return { geometry: bodyGeo, warnings };
  }

  if (params.textStyle === 'emboss') {
    const embossGeos = [];
    for (const face of faces) {
      for (const { text, yOffset } of lines) {
        const g = buildEmbossText(text, font, params, yOffset, face);
        if (g) embossGeos.push(g);
      }
    }
    const merged = mergeGeometries([bodyGeo, ...embossGeos], false);
    merged.computeVertexNormals();
    return { geometry: merged, warnings };

  } else {
    // Engrave: build CSG cutters with proper intersection geometry
    const cutterGeos = [];
    for (const face of faces) {
      for (const { text, yOffset } of lines) {
        const g = buildCutterText(text, font, params, yOffset, face);
        if (g) cutterGeos.push(g);
      }
    }
    const engravedBody = csgEngrave(bodyGeo, cutterGeos);
    return { geometry: engravedBody, warnings };
  }
}
