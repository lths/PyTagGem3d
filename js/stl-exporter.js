/**
 * stl-exporter.js
 * Exports Three.js geometries to binary STL and triggers browser download.
 */

import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import * as THREE from 'three';

const _exporter = new STLExporter();

/**
 * Export a single geometry (or scene) as a binary STL file download.
 * @param {THREE.BufferGeometry|THREE.Object3D} source
 * @param {string} filename  without extension
 */
export function downloadSTL(source, filename = 'tag') {
  let obj;
  if (source instanceof THREE.BufferGeometry) {
    // Wrap in a mesh for the exporter
    const mat = new THREE.MeshBasicMaterial();
    obj = new THREE.Mesh(source, mat);
  } else {
    obj = source;
  }

  const result = _exporter.parse(obj, { binary: true });
  const blob = new Blob([result], { type: 'application/octet-stream' });
  triggerDownload(blob, filename.endsWith('.stl') ? filename : filename + '.stl');
}

/**
 * Export multiple { geometry, filename } pairs as a ZIP archive.
 * Requires JSZip to be loaded globally (loaded via CDN in index.html if used).
 * @param {Array<{geometry: THREE.BufferGeometry, filename: string}>} items
 * @param {string} zipName
 */
export async function downloadBatchZIP(items, zipName = 'tags_batch') {
  if (typeof JSZip === 'undefined') {
    throw new Error('JSZip not loaded');
  }
  const zip = new JSZip();
  const mat = new THREE.MeshBasicMaterial();

  for (const { geometry, filename } of items) {
    const mesh = new THREE.Mesh(geometry, mat);
    const stlData = _exporter.parse(mesh, { binary: true });
    zip.file(filename.endsWith('.stl') ? filename : filename + '.stl', stlData);
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(blob, zipName.endsWith('.zip') ? zipName : zipName + '.zip');
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
