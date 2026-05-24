# RC Footing Calculator — Deployment Guide

Adds the Isolated Footing Calculator to your existing site. Same architecture as the beam and column calculators — no backend or database schema changes.

## 5-step deployment (~10 minutes)

### Step 1 — Upload `rc-footing.ts` (calc engine)

Upload to `artifacts/portfolio/src/lib/calc-engine/`.

Verify:
```bash
wc -l artifacts/portfolio/src/lib/calc-engine/rc-footing.ts
```
Should show **481 lines**.

### Step 2 — Upload `rc-footing-calculator.tsx` (UI component)

Upload to `artifacts/portfolio/src/components/`.

Verify:
```bash
wc -l artifacts/portfolio/src/components/rc-footing-calculator.tsx
```
Should show **768 lines**.

### Step 3 — Replace `structural.tsx`

Replace `artifacts/portfolio/src/pages/structural.tsx`. The only changes are one new import and one new case in `renderCalculator()`.

Verify:
```bash
wc -l artifacts/portfolio/src/pages/structural.tsx
grep -c "RCFootingCalculator" artifacts/portfolio/src/pages/structural.tsx
```
Should show **~389 lines** and **2** matches.

### Step 4 — Seed the calculator card

In Replit Shell:
```bash
psql $DATABASE_URL -c "INSERT INTO structural_files (name, description, category, file_key) VALUES ('Isolated Footing Design', 'NSCP 2015 / ACI 318-14. Square/Rectangular, bearing, flexure, one-way & punching shear.', 'Calculators', 'calc:rc_footing') ON CONFLICT (file_key) DO NOTHING;"
```
Should print: `INSERT 0 1`

### Step 5 — Refresh preview

Refresh your preview browser tab and visit `/structural`. Three cards now under Calculators:
- Reinforced Concrete Beam Calculator
- Reinforced Concrete Column Design
- **Isolated Footing Design** ← NEW

---

## Quick test (with defaults)

Click the new card. Expected values:

| Field | Expected |
|---|---|
| Pu (factored) | **1280.00 kN** (combo U2 governs) |
| qu (avg factored) | **204.80 kPa** |
| Section | **2.5×2.5×0.5 m** |
| d (effective depth) | **395 mm** |
| Reinforcement | **7×7** bars (φ20mm) |
| Mu,x | **282.24 kN·m** |
| Vu (punch) | **1153.80 kN** |
| φVc (punch) | **1371.12 kN** |
| Verdict | **PASS** (green) |

## Try the toggles

- **Footing Type**: Square ↔ Rectangular (Square auto-syncs B = L)
- **Column Position**: Interior (αs=40) ↔ Edge (αs=30) ↔ Corner (αs=20) — punching shear updates
- Change **f'c** to 28 → β1 and Rn change live
- Change **column dimensions** c1/c2 to be unequal → β changes, Vc2 formula activates

## Math verification

Engine output matches Excel exactly (all 265 formulas):

| Quantity | Excel | Engine |
|---|---|---|
| P_max_service | 950.00 kN | 950.00 kN |
| P_max_ultimate | 1280.00 kN | 1280.00 kN |
| qa_eff | 165.00 kPa | 165.00 kPa |
| A_req | 5.7576 m² | 5.7576 m² |
| q1 (corner) | 163.520 kPa | 163.520 kPa |
| qu (factored) | 204.800 kPa | 204.800 kPa |
| Mu_x | 282.240 kN·m | 282.240 kN·m |
| As_req_x | 1958.2 mm² | 1958.2 mm² |
| Nx | 7 | 7 |
| sx | 391.7 mm | 391.7 mm |
| Vu_x (one-way) | 335.360 kN | 335.360 kN |
| φVc_x | 576.975 kN | 576.975 kN |
| bo (perimeter) | 3.1400 m | 3.1400 m |
| Vu (punch) | 1153.797 kN | 1153.797 kN |
| Vc_gov (min of 3) | 1828.159 kN | 1828.159 kN |
| φVc (punch) | 1371.119 kN | 1371.119 kN |

---

## What's in the calculator

1. **Load Combinations** — 6 service + 7 ultimate (NSCP 203 / ACI 5.3)
2. **Footing Sizing & Stability** — qa,eff, A_req, eccentricity, sliding (FS≥1.5), overturning (FS≥2.0)
3. **Soil Pressure** — 4 corner pressures (q1–q4), uplift check, bearing check, factored pressures
4. **Flexural Design X** — bars parallel to L
5. **Flexural Design Y** — bars parallel to B
6. **One-Way Shear** — both directions at d (or d') from face of column
7. **Punching Shear** — three formulas (Vc1, Vc2, Vc3), governing minimum, αs by column position
8. **Reinforcement Detailing** — bar lengths, total mass with 5% lap, dev length, anchorage check
9. **BOQ** — excavation, concrete, rebar X, rebar Y, mass, formwork
10. **Summary & Certification** — overall verdict with all status pills

Plus a **footing plan view (SVG)** that updates live, showing:
- Footing outline with dimension lines
- Column position in the center
- Rebar in X direction (blue lines)
- Rebar in Y direction (red lines)
- Cover line dashed

---

## Troubleshooting

**Card doesn't appear** → check `file_key` is exactly `calc:rc_footing` (not `calc:rc-footing`)

**"Cannot find module @/lib/calc-engine/rc-footing"** → file uploaded to wrong folder

**Click does nothing** → re-check the `structural.tsx` replacement ran clean

---

After footing works, send me the **RC Slab Design** Excel file when you're ready and we'll do the same thing one more time.
