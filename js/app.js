/**
 * app.js — Main application controller
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { buildTag, buildTagForExport } from './tag-generator.js';
import { downloadSTL, downloadBatchZIP } from './stl-exporter.js';
import { parseBatchCSV } from './batch-processor.js';
import { DEFAULT_PARAMS } from './config.js';

// ─────────────────────────────────────────────
//  Three.js scene
// ─────────────────────────────────────────────
const container = document.getElementById('preview3d');
const renderer  = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled  = true;
renderer.shadowMap.type     = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const scene  = new THREE.Scene();
scene.background = new THREE.Color(0x1a1d23);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
camera.position.set(0, 10, 130);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping  = true;
controls.dampingFactor  = 0.08;

// ── Lighting ──────────────────────────────────
// Low ambient so engraved cavities stay visibly darker
scene.add(new THREE.AmbientLight(0xffffff, 0.25));

// Primary key light — slightly off-axis so engravings cast clear shadows
const keyLight = new THREE.DirectionalLight(0xffffff, 1.4);
keyLight.position.set(40, 60, 100);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
scene.add(keyLight);

// Soft fill from the opposite side — weaker so it doesn't wash out grooves
const fillLight = new THREE.DirectionalLight(0x99aacc, 0.35);
fillLight.position.set(-60, -20, -80);
scene.add(fillLight);

// Rim light from above to pop edges
const rimLight = new THREE.DirectionalLight(0xffffff, 0.5);
rimLight.position.set(0, 120, -40);
scene.add(rimLight);

// Grid
const grid = new THREE.GridHelper(200, 20, 0x303540, 0x2a2f3a);
grid.position.y = -25;
scene.add(grid);

// Resize observer
new ResizeObserver(() => {
  const w = container.clientWidth, h = container.clientHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}).observe(container);

(function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
})();

// ─────────────────────────────────────────────
//  Materials
// ─────────────────────────────────────────────
// Two body materials — solid and slightly transparent (for engrave preview)
const MAT_BODY = new THREE.MeshStandardMaterial({
  color: 0x2e7db5, roughness: 0.45, metalness: 0.1,
});
const MAT_BODY_ENGRAVE = new THREE.MeshStandardMaterial({
  color: 0x2e7db5, roughness: 0.45, metalness: 0.1,
  transparent: true, opacity: 0.82,
  depthWrite: false,   // let recessed text faces render through
});
// Front emboss — white/light blue raised text
const MAT_EMBOSS_FRONT = new THREE.MeshStandardMaterial({
  color: 0xdaecff, roughness: 0.3, metalness: 0.05,
});
// Back emboss — gold/amber raised text
const MAT_EMBOSS_BACK = new THREE.MeshStandardMaterial({
  color: 0xffd080, roughness: 0.35, metalness: 0.0,
});
// Engrave preview — dark, recessed into the face
const MAT_ENGRAVE_FRONT = new THREE.MeshStandardMaterial({
  color: 0x060e18, roughness: 0.9,
  polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
});
const MAT_ENGRAVE_BACK = new THREE.MeshStandardMaterial({
  color: 0x180e00, roughness: 0.9,
  polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
});
const MAT_WIRE      = new THREE.MeshBasicMaterial({ color: 0x4a9eff, wireframe: true });
const MAT_WIRE_TEXT = new THREE.MeshBasicMaterial({ color: 0xaad4ff, wireframe: true });

// ─────────────────────────────────────────────
//  State
// ─────────────────────────────────────────────
let tagBodyMesh   = null;
let tagTextMeshes = [];
let wireframeMode = false;
let loadedFont    = null;

// ─────────────────────────────────────────────
//  Font loading
// ─────────────────────────────────────────────
const FONT_URL    = './fonts/Dongle_Regular.json';
const fontStatus  = document.getElementById('fontStatus');

new FontLoader().load(
  FONT_URL,
  (font) => {
    loadedFont = font;
    fontStatus.style.display = 'none';
    rebuildPreview();
  },
  undefined,
  (err) => {
    console.warn('Font load failed:', err);
    fontStatus.style.display = 'block';
    rebuildPreview();
  }
);

// ─────────────────────────────────────────────
//  Read all params from UI
// ─────────────────────────────────────────────
function getParams() {
  const n = id => parseFloat(document.getElementById(id).value) || 0;
  const s = id => document.getElementById(id).value.trim();
  const b = id => document.getElementById(id).checked;
  return {
    width:        n('tagWidth'),
    height:       n('tagHeight'),
    thickness:    n('tagThickness'),
    cornerRadius: n('cornerRadius'),
    edgeType:     s('edgeType'),
    edgeSize:     n('edgeSize'),
    holeEnabled:  b('holeEnabled'),
    holeLayout:   s('holeLayout'),
    holeDiameter: n('holeDiameter'),
    holeMargin:   n('holeMargin'),
    textLine1:    s('textLine1'),
    textLine2:    s('textLine2'),
    fontSize:     n('fontSize'),
    textDepth:    n('textDepth'),
    textStyle:    s('textStyle'),
    mirrorText:   b('mirrorText'),
  };
}

// ─────────────────────────────────────────────
//  Warnings
// ─────────────────────────────────────────────
const warningBanner = document.getElementById('warningBanner');

function showWarnings(warnings) {
  if (!warnings || warnings.length === 0) {
    warningBanner.style.display = 'none';
    return;
  }
  warningBanner.innerHTML = warnings.map(w => `⚠ ${w}`).join('<br/>');
  warningBanner.style.display = 'block';
}

// ─────────────────────────────────────────────
//  Preview rebuild
// ─────────────────────────────────────────────
function clearTagMeshes() {
  if (tagBodyMesh) {
    scene.remove(tagBodyMesh);
    tagBodyMesh.geometry.dispose();
    tagBodyMesh = null;
  }
  tagTextMeshes.forEach(m => { scene.remove(m); if (m.geometry) m.geometry.dispose(); });
  tagTextMeshes = [];
}

function rebuildPreview() {
  const params = getParams();
  clearTagMeshes();

  try {
    const { body, texts, textStyle, warnings } = buildTag(params, loadedFont);
    showWarnings(warnings);

    // Use a slightly transparent body when engraving so recessed text shows through
    const isEngrave = params.textStyle === 'engrave' && texts.length > 0;
    const bodyMat = wireframeMode ? MAT_WIRE
                  : isEngrave     ? MAT_BODY_ENGRAVE
                  :                 MAT_BODY;
    tagBodyMesh = new THREE.Mesh(body, bodyMat);
    tagBodyMesh.receiveShadow = true;
    tagBodyMesh.castShadow    = true;
    scene.add(tagBodyMesh);

    // texts is an array of { geo, face } — use face-aware and style-aware materials
    texts.forEach(({ geo, face }) => {
      let mat;
      if (wireframeMode) {
        mat = MAT_WIRE_TEXT;
      } else if (textStyle === 'engrave') {
        mat = face === 'back' ? MAT_ENGRAVE_BACK : MAT_ENGRAVE_FRONT;
      } else {
        mat = face === 'back' ? MAT_EMBOSS_BACK : MAT_EMBOSS_FRONT;
      }
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = true;
      scene.add(m);
      tagTextMeshes.push(m);
    });

    const bb = new THREE.Box3().setFromObject(tagBodyMesh);
    const sz = new THREE.Vector3();
    bb.getSize(sz);
    document.getElementById('previewInfo').textContent =
      `${sz.x.toFixed(1)} × ${sz.y.toFixed(1)} × ${sz.z.toFixed(1)} mm`;

  } catch (e) {
    console.error('Tag build error:', e);
    showWarnings(['Build error: ' + e.message]);
    document.getElementById('previewInfo').textContent = 'Build error — check parameters.';
  }
}

// ─────────────────────────────────────────────
//  UI event wiring
// ─────────────────────────────────────────────
function $id(x) { return document.getElementById(x); }

let rebuildTimer = null;
function scheduleRebuild() {
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(rebuildPreview, 150);
}

[
  'tagWidth','tagHeight','tagThickness','cornerRadius','edgeType','edgeSize',
  'holeEnabled','holeLayout','holeDiameter','holeMargin',
  'textLine1','textLine2','fontSize','textDepth','textStyle','mirrorText',
].forEach(inputId => {
  $id(inputId).addEventListener('input',  scheduleRebuild);
  $id(inputId).addEventListener('change', scheduleRebuild);
});

// Disable hole sub-inputs when hole is off
function syncHoleInputs() {
  const on = $id('holeEnabled').checked;
  ['holeLayout','holeDiameter','holeMargin'].forEach(id => {
    $id(id).disabled = !on;
  });
}
$id('holeEnabled').addEventListener('change', syncHoleInputs);
syncHoleInputs();

// Enable edge size input only when chamfer or fillet is selected
function syncEdgeInputs() {
  $id('edgeSize').disabled = $id('edgeType').value === 'none';
}
$id('edgeType').addEventListener('change', syncEdgeInputs);
syncEdgeInputs();

$id('btnResetView').addEventListener('click', () => {
  camera.position.set(0, 10, 130);
  controls.target.set(0, 0, 0);
  controls.update();
});

$id('btnToggleWire').addEventListener('click', () => {
  wireframeMode = !wireframeMode;
  $id('btnToggleWire').textContent = wireframeMode ? 'Solid' : 'Wireframe';
  rebuildPreview();
});

// ─────────────────────────────────────────────
//  Single STL export
// ─────────────────────────────────────────────
$id('btnExportSingle').addEventListener('click', () => {
  const params = getParams();
  const prefix = $id('filenamePrefix').value.trim() || 'tag';
  try {
    const { geometry, warnings } = buildTagForExport(params, loadedFont);
    showWarnings(warnings);
    downloadSTL(geometry, prefix);
  } catch (e) {
    console.error('Export failed:', e);
    showWarnings(['Export failed: ' + e.message]);
  }
});

// ─────────────────────────────────────────────
//  Batch CSV import
// ─────────────────────────────────────────────
let batchItems = [];

document.querySelector('.file-label').addEventListener('click', () => $id('csvFile').click());

$id('csvFile').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;
  $id('csvFile').value = '';

  const reader = new FileReader();
  reader.onload = (ev) => {
    const defaults = getParams();
    const { items, errors } = parseBatchCSV(ev.target.result, defaults);
    batchItems = items;

    const status = $id('batchStatus');
    if (errors.length) {
      status.className   = 'batch-status err';
      status.textContent = errors[0] + (errors.length > 1 ? ` (+${errors.length - 1} more)` : '');
    }
    if (items.length) {
      status.className   = 'batch-status ok';
      status.textContent = `${items.length} tag${items.length !== 1 ? 's' : ''} loaded.`;
      $id('btnBatchExport').disabled = false;
      applyParamsToUI(items[0]);
      rebuildPreview();
    } else if (!errors.length) {
      status.className   = 'batch-status err';
      status.textContent = 'No valid rows found.';
    }
  };
  reader.readAsText(file);
});

// ─────────────────────────────────────────────
//  Batch export with progress
// ─────────────────────────────────────────────
$id('btnBatchExport').addEventListener('click', async () => {
  if (!batchItems.length) return;

  const btn          = $id('btnBatchExport');
  const progressWrap = $id('batchProgressWrap');
  const progressText = $id('batchProgressText');
  const progressBar  = $id('batchProgressBar');

  btn.disabled = true;
  progressWrap.style.display = 'block';
  progressBar.style.width    = '0%';

  try {
    if (typeof JSZip === 'undefined') {
      progressText.textContent = 'Loading JSZip…';
      await loadScript('https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js');
    }

    const prefix        = $id('filenamePrefix').value.trim() || 'batch';
    const total         = batchItems.length;
    const exportItems   = [];
    const batchWarnings = [];

    for (let i = 0; i < total; i++) {
      const params = batchItems[i];
      progressText.textContent = `Generating ${i + 1} / ${total}: ${params._name}`;
      progressBar.style.width  = `${((i + 1) / total) * 100}%`;
      await yieldToBrowser();

      try {
        const { geometry, warnings } = buildTagForExport(params, loadedFont);
        if (warnings.length) batchWarnings.push(`${params._name}: ${warnings[0]}`);
        exportItems.push({ geometry, filename: sanitizeFilename(params._name) });
      } catch (e) {
        batchWarnings.push(`${params._name}: build error — ${e.message}`);
      }
    }

    progressText.textContent = 'Zipping…';
    await downloadBatchZIP(exportItems, prefix + '_tags');
    progressText.textContent = `Done — ${exportItems.length} STLs exported.`;
    progressBar.style.width  = '100%';

    if (batchWarnings.length) {
      $id('batchStatus').className   = 'batch-status err';
      $id('batchStatus').textContent =
        `${batchWarnings.length} warning(s): ${batchWarnings[0]}` +
        (batchWarnings.length > 1 ? ` (+${batchWarnings.length - 1} more)` : '');
    }
  } catch (err) {
    console.error('Batch export error:', err);
    $id('batchStatus').className   = 'batch-status err';
    $id('batchStatus').textContent = 'Export failed: ' + err.message;
    progressWrap.style.display     = 'none';
  } finally {
    btn.disabled = false;
    setTimeout(() => { progressWrap.style.display = 'none'; }, 5000);
  }
});

// ─────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────
function applyParamsToUI(p) {
  const set  = (id, v) => { if (v != null) $id(id).value = v; };
  const setb = (id, v) => { if (v != null) $id(id).checked = !!v; };
  set ('tagWidth',     p.width);
  set ('tagHeight',    p.height);
  set ('tagThickness', p.thickness);
  set ('cornerRadius', p.cornerRadius);
  set ('edgeType',     p.edgeType);
  set ('edgeSize',     p.edgeSize);
  syncEdgeInputs();
  setb('holeEnabled',  p.holeEnabled);
  set ('holeLayout',   p.holeLayout);
  set ('holeDiameter', p.holeDiameter);
  set ('holeMargin',   p.holeMargin);
  set ('textLine1',    p.textLine1);
  set ('textLine2',    p.textLine2);
  set ('fontSize',     p.fontSize);
  set ('textDepth',    p.textDepth);
  set ('textStyle',    p.textStyle);
  setb('mirrorText',   p.mirrorText);
  syncHoleInputs();
}

function sanitizeFilename(name) {
  return (name || 'tag')
    .replace(/\.\./g, '_')
    .replace(/[/\\:*?"<>|]/g, '_')
    .replace(/[^\x20-\x7E]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^\.+/, '_')
    .slice(0, 80) || 'tag';
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s    = document.createElement('script');
    s.src      = src;
    s.onload   = resolve;
    s.onerror  = () => reject(new Error(`Failed to load: ${src}`));
    document.head.appendChild(s);
  });
}

function yieldToBrowser() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

// ─────────────────────────────────────────────
//  Boot — apply config defaults, then render
// ─────────────────────────────────────────────
applyParamsToUI(DEFAULT_PARAMS);
$id('filenamePrefix').value = DEFAULT_PARAMS.filenamePrefix;
rebuildPreview();
