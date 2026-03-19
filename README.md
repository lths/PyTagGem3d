# PyTagGem3D

A browser-based 3D STL generator for valve and name tags. Design tags interactively, preview them in real time, and export print-ready STL files — one at a time or in bulk from a CSV.

---

## Features

- **Interactive 3D preview** — orbit, zoom, and pan with mouse; wireframe toggle
- **Fully parametric tags** — width, height, thickness, corner radius
- **Mounting hole** — toggle on/off, set diameter and margin
- **Two-line text** — embossed (raised) or engraved (true boolean cut using CSG)
- **Single STL export** — one click, one file
- **Batch export** — import a CSV, generate all tags, download as a ZIP

---

## Getting Started

No build step is required. The app runs entirely in the browser using ES modules and CDN libraries.

### Prerequisites

- A modern browser (Chrome 89+, Edge 89+, Firefox 108+, Safari 16.4+)
- A local HTTP server (required for ES modules — `file://` will not work)

### Run locally

**Option A — Python (recommended, no install needed)**

```bash
cd PyTagGem3d
python -m http.server 8080
```

Then open `http://localhost:8080` in your browser.

**Option B — VS Code Live Server**

Right-click `index.html` in the VS Code Explorer → **Open with Live Server**.

**Option C — Node.js**

```bash
npx serve .
```

---

## Interface Overview

```
┌─────────────────┬──────────────────────────────────────┐
│  Tag Dimensions │                                      │
│  Mounting Hole  │         3D Preview                   │
│  Text           │   (drag / scroll / right-drag)       │
│  Export         │                                      │
│  Batch Import   │                                      │
└─────────────────┴──────────────────────────────────────┘
```

### Tag Dimensions

| Parameter | Default | Description |
|---|---|---|
| Width | 60 mm | Overall tag width |
| Height | 30 mm | Overall tag height |
| Thickness | 3 mm | Overall tag thickness |
| Corner Radius | 3 mm | Rounding on all four corners (0 = sharp) |

### Mounting Hole

| Parameter | Default | Description |
|---|---|---|
| Enable Hole | On | Toggle the mounting hole |
| Hole Diameter | 5 mm | Diameter of the through-hole |
| Hole Margin | 6 mm | Distance from hole center to the top edge |

### Text

| Parameter | Default | Description |
|---|---|---|
| Line 1 | VALVE-001 | Top text line |
| Line 2 | N/O | Bottom text line (leave blank for one line) |
| Font Size | 6 mm | Character height |
| Text Depth | 0.8 mm | How far the text rises or cuts in |
| Text Style | Embossed | **Embossed** = text raised above surface; **Engraved** = text cut into surface (true CSG boolean subtract) |

### Preview Controls

| Action | Result |
|---|---|
| Left-drag | Rotate |
| Scroll wheel | Zoom |
| Right-drag | Pan |
| **Reset View** button | Return to default camera position |
| **Wireframe** button | Toggle solid / wireframe display |

---

## Exporting a Single Tag

1. Set parameters in the left panel.
2. Enter a **Filename Prefix** (e.g. `valve_001`).
3. Click **Export STL**.

The file downloads as `<prefix>.stl`, ready to open in any slicer (Cura, PrusaSlicer, Bambu Studio, etc.).

---

## Batch Export

### CSV Format

Upload a `.csv` file with a header row. Only the `name` column is required; all others fall back to the current UI values.

```csv
name,line1,line2,width,height,thickness,corner_radius,hole_enabled,hole_diameter,hole_margin,font_size,text_depth,text_style
VALVE-001,VALVE-001,N/O,60,30,3,3,true,5,6,6,0.8,emboss
VALVE-002,VALVE-002,N/C,60,30,3,3,true,5,6,6,0.8,emboss
PUMP-001,PUMP-001,BYPASS,60,30,3,3,true,5,6,6,1.0,engrave
DRAIN-01,DRAIN-01,,50,25,3,2,false,,,5,0.8,emboss
```

**Column reference:**

| Column | Type | Example | Notes |
|---|---|---|---|
| `name` | string | `VALVE-001` | **Required.** Used as the STL filename |
| `line1` | string | `VALVE-001` | Top text; defaults to `name` if blank |
| `line2` | string | `N/O` | Bottom text; blank for single-line |
| `width` | number | `60` | mm |
| `height` | number | `30` | mm |
| `thickness` | number | `3` | mm |
| `corner_radius` | number | `3` | mm, 0 for sharp corners |
| `hole_enabled` | bool | `true` | `true`/`false` or `1`/`0` |
| `hole_diameter` | number | `5` | mm |
| `hole_margin` | number | `6` | mm from hole center to top edge |
| `font_size` | number | `6` | mm |
| `text_depth` | number | `0.8` | mm |
| `text_style` | string | `emboss` | `emboss` or `engrave` |

A sample file is included: [`sample_tags.csv`](sample_tags.csv)

### Steps

1. Click **Choose CSV File** and select your file.
2. The first tag in the file is previewed automatically.
3. Click **Export Batch ZIP** — a progress bar shows generation status.
4. A `.zip` file downloads containing one `.stl` per row.

---

## Validation Warnings

If any parameters produce geometry that may not print correctly, a red warning banner appears in the preview:

- Hole diameter too large for the tag
- Hole extends outside the tag boundary
- Text wider than the tag
- Text depth ≥ tag thickness
- Font size too large for tag height

Warnings do not block export — they are advisory.

---

## Engraved Text (CSG)

Engraved text uses **Constructive Solid Geometry (CSG)** boolean subtraction via [`three-bvh-csg`](https://github.com/gkjohnson/three-bvh-csg). The text is literally subtracted from the tag body and exported as a single watertight mesh — no post-processing in your slicer needed.

> **Note:** CSG subtraction is more computationally expensive than embossing. For large batches with engraved text, generation may take a few seconds per tag.

---

## Dependencies

All loaded from CDN — no `npm install` needed to run. Versions are pinned in [`package.json`](package.json).

| Library | Version | Purpose |
|---|---|---|
| [Three.js](https://threejs.org) | 0.165.0 | 3D rendering, geometry, STL export |
| [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) | 0.7.8 | BVH acceleration (CSG dependency) |
| [three-bvh-csg](https://github.com/gkjohnson/three-bvh-csg) | 0.0.17 | Boolean CSG for engraved text |
| [JSZip](https://stuk.github.io/jszip/) | 3.10.1 | ZIP archive for batch export (loaded on demand) |

---

## File Structure

```
PyTagGem3d/
├── index.html              # App shell and UI layout
├── package.json            # Dependency version manifest
├── sample_tags.csv         # Example batch CSV
├── css/
│   └── style.css           # Dark-theme UI styles
└── js/
    ├── app.js              # Main controller (UI, preview, export)
    ├── tag-generator.js    # 3D geometry builder (body + text + CSG)
    ├── stl-exporter.js     # STL and ZIP download
    └── batch-processor.js  # CSV parser
```

---

## Tips for 3D Printing

- **Minimum feature size** — keep font size ≥ 4 mm and text depth ≥ 0.6 mm for reliable printing on FDM printers.
- **Embossed vs. engraved** — embossed text is generally more legible at small sizes. Engraved text works better for painted or filled tags.
- **Layer height** — for fine text, use ≤ 0.15 mm layer height.
- **Orientation** — print flat (tag face up) for best text definition.
- **Material** — PETG and ASA hold up well outdoors; add UV-stable filament for exterior valve tags.
