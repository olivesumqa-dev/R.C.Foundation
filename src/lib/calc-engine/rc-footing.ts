/**
 * Isolated Footing Design Engine
 *
 * Pure-function calculation engine. No DOM, no React.
 * Faithful port of Isolated_Footing_Design.xlsx formulas.
 *
 * Standards: NSCP 2015 / ACI 318-14 — Ultimate Strength Design (USD)
 *
 * Handles:
 *  • Square OR Rectangular isolated footings
 *  • Interior / Edge / Corner column position (drives αs for punching)
 *  • Service & Ultimate load combinations (NSCP 203 / ACI 5.3)
 *  • Soil pressure with biaxial moments (4 corner pressures)
 *  • Eccentricity, sliding, overturning stability checks
 *  • Flexural design both directions (X and Y) with min ρ shrink/temp
 *  • One-way (beam) shear check both directions
 *  • Two-way (punching) shear with three formulas (governing min)
 *  • Reinforcement detailing and development length
 */

export type FootingType = "Square" | "Rectangular";
export type ColumnPosition = "Interior" | "Edge" | "Corner";

export interface FootingInputs {
  // Project metadata
  projName: string;
  projMark: string;
  projBy: string;
  projDate: string;

  // Service loads (unfactored)
  PD: number;       // kN, axial dead
  PL: number;       // kN, axial live
  PLr: number;      // kN, axial roof live
  PW: number;       // kN, axial wind
  PE: number;       // kN, axial seismic
  Mx_s: number;     // kN·m, moment about x (service)
  My_s: number;     // kN·m, moment about y (service)
  Hx: number;       // kN, horizontal load x (service)
  Hy: number;       // kN, horizontal load y (service)

  // Column / pedestal
  ftgType: FootingType;
  colPosition: ColumnPosition;
  c1: number;       // m, column width (x)
  c2: number;       // m, column depth (y)
  bp: number;       // m, pedestal width
  hp: number;       // m, pedestal depth

  // Footing trial dimensions
  L: number;        // m, footing length (x-dir)
  B: number;        // m, footing width (y-dir)
  h_ftg: number;    // m, footing thickness
  cover: number;    // m, concrete cover (bottom)
  db: number;       // mm, main bar diameter

  // Materials
  fc: number;       // MPa, concrete strength
  fy: number;       // MPa, steel yield strength
  gamma_c: number;  // kN/m³, concrete unit weight
  gamma_s: number;  // kN/m³, soil unit weight
  lambda: number;   // concrete modification factor

  // Soil
  qa: number;       // kPa, allowable bearing
  qs: number;       // kPa, surcharge
  Df: number;       // m, depth of soil above footing
  mu_soil: number;  // coefficient of friction

  // Strength reduction factors
  phi_flex: number; // 0.9
  phi_shear: number; // 0.75

  // Detailing
  rho_min: number;  // shrinkage/temperature, 0.0018
  s_max: number;    // max bar spacing, mm
}

export const DEFAULT_FOOTING_INPUTS: FootingInputs = {
  projName: "—",
  projMark: "F-1",
  projBy: "—",
  projDate: "",
  PD: 600, PL: 350, PLr: 0, PW: 0, PE: 0,
  Mx_s: 30, My_s: 0, Hx: 0, Hy: 0,
  ftgType: "Square",
  colPosition: "Interior",
  c1: 0.4, c2: 0.4, bp: 0.4, hp: 0.4,
  L: 2.5, B: 2.5, h_ftg: 0.5, cover: 0.075, db: 20,
  fc: 21, fy: 415,
  gamma_c: 24, gamma_s: 18, lambda: 1,
  qa: 200, qs: 5, Df: 1.5, mu_soil: 0.45,
  phi_flex: 0.9, phi_shear: 0.75,
  rho_min: 0.0018, s_max: 450,
};

export interface LoadComboF {
  id: string;
  desc: string;
  P: number;     // kN
  Mx: number;    // kN·m
  My: number;    // kN·m
  governs?: boolean;
}

export interface FootingResults {
  inputs: FootingInputs;

  loads: {
    service: LoadComboF[];
    ultimate: LoadComboF[];
    P_max_service: number;
    Mx_max_service: number;
    My_max_service: number;
    P_max_ultimate: number;
    Mx_max_ultimate: number;
    My_max_ultimate: number;
    gov_service_desc: string;
    gov_ultimate_desc: string;
  };

  sizing: {
    sw_per_m2: number;        // γc·h (kPa)
    soil_per_m2: number;      // γs·(Df-h)
    qa_eff: number;           // kPa
    A_req: number;            // m²
    side_req: number;         // m
    A_prov: number;           // m²
    sizing_check: string;     // ADEQUATE / INCREASE
    ex: number; ey: number;
    L_over_6: number; B_over_6: number;
    middle_third_x: string;
    middle_third_y: string;
    Wf: number;               // kN
    Ws: number;               // kN
    sum_V: number;            // kN
    H_total: number;          // kN
    sliding_F: number;        // kN
    FS_sliding: number | "N/A";
    sliding_status: string;
    MO: number; MR: number;
    FS_overturning: number | "N/A";
    overturning_status: string;
  };

  pressure: {
    A: number; Sx: number; Sy: number;
    q1: number; q2: number; q3: number; q4: number;
    q_max: number; q_min: number;
    uplift_status: string;
    bearing_status: string;
    util: number;
    qu_avg: number;
    qu_max: number;
    qu_min: number;
  };

  flexure: {
    h_mm: number; cover_mm: number;
    d: number; d_m: number;
    d_prime: number; d_prime_m: number;
    beta1: number;

    // X direction
    lx: number;
    Mu_x: number;
    Rn_x: number; rho_x: number; rho_design_x: number;
    As_req_x: number;
    Ab: number;
    Nx_calc: number; Nx_min: number; Nx: number;
    As_prov_x: number;
    sx: number;
    flex_x_status: string;
    spacing_x_status: string;

    // Y direction
    ly: number;
    Mu_y: number;
    Rn_y: number; rho_y: number; rho_design_y: number;
    As_req_y: number;
    Ny_calc: number; Ny_min: number; Ny: number;
    As_prov_y: number;
    sy: number;
    flex_y_status: string;
    spacing_y_status: string;
  };

  oneWayShear: {
    Vu_x: number; phiVc_x: number; util_x: number; status_x: string;
    Vu_y: number; phiVc_y: number; util_y: number; status_y: string;
  };

  punching: {
    davg: number; davg_m: number;
    beta: number; alpha_s: number;
    bo: number; A_crit: number;
    Vu: number;
    Vc1: number; Vc2: number; Vc3: number;
    Vc_gov: number; phiVc: number;
    util: number;
    status: string;
    h_recommended: number;
  };

  detail: {
    bar_length_x: number; bar_length_y: number;
    total_bar_length: number;
    unit_mass: number;
    total_mass: number;
    mass_with_lap: number;
    ld: number;           // development length
    la_avail: number;     // available anchorage
    anchorage_status: string;
  };

  qty: {
    conc_vol: number;          // m³
    steel_mass: number;        // kg (with lap allowance)
    formwork: number;          // m² (sides of footing)
    excavation: number;        // m³
  };

  overall_verdict: "PASS" | "FAIL";
}

export function fmt(x: number | undefined | null, decimals = 2): string {
  if (typeof x !== "number" || !isFinite(x)) return "—";
  return x.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPUTATION
// ─────────────────────────────────────────────────────────────────────────────
export function computeFooting(i: FootingInputs): FootingResults {

  // ─── 1. LOAD COMBINATIONS ──────────────────────────────────────────────────
  const service: LoadComboF[] = [
    { id: "S1", desc: "D",                       P: i.PD,                                      Mx: i.Mx_s, My: i.My_s },
    { id: "S2", desc: "D + L",                   P: i.PD + i.PL,                               Mx: i.Mx_s, My: i.My_s },
    { id: "S3", desc: "D + L + Lr",              P: i.PD + i.PL + i.PLr,                       Mx: i.Mx_s, My: i.My_s },
    { id: "S4", desc: "D + 0.75L + 0.75(W or E)", P: i.PD + 0.75*i.PL + 0.75*Math.max(i.PW, i.PE), Mx: i.Mx_s, My: i.My_s },
    { id: "S5", desc: "0.6D + W",                P: 0.6*i.PD + i.PW,                           Mx: i.Mx_s, My: i.My_s },
    { id: "S6", desc: "0.6D + 0.7E",             P: 0.6*i.PD + 0.7*i.PE,                       Mx: i.Mx_s, My: i.My_s },
  ];
  const P_max_service = Math.max(...service.map(s => s.P));
  const Mx_max_service = Math.max(...service.map(s => s.Mx));
  const My_max_service = Math.max(...service.map(s => s.My));
  service.forEach(s => { s.governs = s.P === P_max_service; });
  const gov_service_desc = service.find(s => s.governs)!.desc;

  const ultimate: LoadComboF[] = [
    { id: "U1", desc: "1.4D",                       P: 1.4*i.PD,                                          Mx: 1.4*i.Mx_s,                            My: 1.4*i.My_s },
    { id: "U2", desc: "1.2D + 1.6L + 0.5Lr",        P: 1.2*i.PD + 1.6*i.PL + 0.5*i.PLr,                   Mx: 1.2*i.Mx_s,                            My: 1.2*i.My_s },
    { id: "U3", desc: "1.2D + 1.6Lr + 0.5L",        P: 1.2*i.PD + 1.6*i.PLr + 0.5*i.PL,                   Mx: 1.2*i.Mx_s,                            My: 1.2*i.My_s },
    { id: "U4", desc: "1.2D + 1.0W + 0.5L + 0.5Lr", P: 1.2*i.PD + 1.0*i.PW + 0.5*i.PL + 0.5*i.PLr,        Mx: 1.2*i.Mx_s,                            My: 1.2*i.My_s },
    { id: "U5", desc: "1.2D + 1.0E + 0.5L",         P: 1.2*i.PD + 1.0*i.PE + 0.5*i.PL,                    Mx: 1.2*i.Mx_s,                            My: 1.2*i.My_s },
    { id: "U6", desc: "0.9D + 1.0W",                P: 0.9*i.PD + 1.0*i.PW,                               Mx: 0.9*i.Mx_s,                            My: 0.9*i.My_s },
    { id: "U7", desc: "0.9D + 1.0E",                P: 0.9*i.PD + 1.0*i.PE,                               Mx: 0.9*i.Mx_s,                            My: 0.9*i.My_s },
  ];
  const P_max_ultimate = Math.max(...ultimate.map(u => u.P));
  const Mx_max_ultimate = Math.max(...ultimate.map(u => u.Mx));
  const My_max_ultimate = Math.max(...ultimate.map(u => u.My));
  ultimate.forEach(u => { u.governs = u.P === P_max_ultimate; });
  const gov_ultimate_desc = ultimate.find(u => u.governs)!.desc;

  // ─── 2. FOOTING SIZING & STABILITY ────────────────────────────────────────
  const sw_per_m2 = i.gamma_c * i.h_ftg;                          // kPa
  const soil_per_m2 = Math.max(0, i.gamma_s * (i.Df - i.h_ftg));  // kPa
  const qa_eff = i.qa - sw_per_m2 - soil_per_m2 - i.qs;
  const A_req = P_max_service / Math.max(1, qa_eff);
  const side_req = Math.sqrt(A_req);
  const A_prov = i.L * i.B;
  const sizing_check = A_prov >= A_req ? "✓ ADEQUATE" : "✗ INCREASE FTG SIZE";

  const ex = P_max_service > 0 ? Mx_max_service / P_max_service : 0;
  const ey = P_max_service > 0 ? My_max_service / P_max_service : 0;
  const L_over_6 = i.L / 6;
  const B_over_6 = i.B / 6;
  const middle_third_x = Math.abs(ex) <= L_over_6 ? "✓ OK" : "⚠ EXCEEDS";
  const middle_third_y = Math.abs(ey) <= B_over_6 ? "✓ OK" : "⚠ EXCEEDS";

  const Wf = i.gamma_c * i.L * i.B * i.h_ftg;
  // Soil weight on top of footing (excluding column footprint × pedestal)
  const Ws = i.gamma_s * Math.max(0, (i.L*i.B - i.c1*i.c2)) * Math.max(0, i.Df - i.h_ftg);
  const sum_V = P_max_service + Wf + Ws;
  const H_total = Math.sqrt(i.Hx*i.Hx + i.Hy*i.Hy);
  const sliding_F = i.mu_soil * (P_max_service + Wf);
  const FS_sliding: number | "N/A" = H_total <= 0.01 ? "N/A" : sliding_F / H_total;
  const sliding_status =
    H_total <= 0.01 ? "N/A (no lateral)" :
    (typeof FS_sliding === "number" && FS_sliding >= 1.5 ? "✓ SAFE (≥ 1.5)" : "✗ NOT SAFE");

  const MO = Math.max(Math.abs(Mx_max_service), Math.abs(My_max_service));
  const MR = (P_max_service + Wf) * Math.min(i.L, i.B) / 2;
  const FS_overturning: number | "N/A" = MO <= 0.01 ? "N/A" : MR / MO;
  const overturning_status =
    MO <= 0.01 ? "N/A (no moment)" :
    (typeof FS_overturning === "number" && FS_overturning >= 2.0 ? "✓ SAFE (≥ 2.0)" : "✗ NOT SAFE");

  // ─── 3. SOIL PRESSURE ─────────────────────────────────────────────────────
  const A_ftg = i.L * i.B;
  const Sx_ftg = i.B * i.L * i.L / 6;
  const Sy_ftg = i.L * i.B * i.B / 6;

  // Service-level corner pressures: q = P/A ± Mx/Sx ± My/Sy
  const q_mid = P_max_service / A_ftg;
  const q1 = q_mid + Mx_max_service/Sx_ftg + My_max_service/Sy_ftg;
  const q2 = q_mid + Mx_max_service/Sx_ftg - My_max_service/Sy_ftg;
  const q3 = q_mid - Mx_max_service/Sx_ftg + My_max_service/Sy_ftg;
  const q4 = q_mid - Mx_max_service/Sx_ftg - My_max_service/Sy_ftg;
  const q_max = Math.max(q1, q2, q3, q4);
  const q_min = Math.min(q1, q2, q3, q4);

  const uplift_status = q_min >= 0 ? "✓ NO UPLIFT" : "⚠ UPLIFT — INCREASE FTG";
  const bearing_status = q_max <= i.qa ? "✓ SAFE" : "✗ OVERSTRESS — INCREASE FTG SIZE";
  const util = q_max / i.qa;

  // Factored pressures
  const qu_avg = P_max_ultimate / A_ftg;
  const qu_max = qu_avg + Mx_max_ultimate/Sx_ftg + My_max_ultimate/Sy_ftg;
  const qu_min = qu_avg - Mx_max_ultimate/Sx_ftg - My_max_ultimate/Sy_ftg;

  // ─── 4. FLEXURAL DESIGN ───────────────────────────────────────────────────
  const h_mm = i.h_ftg * 1000;
  const cover_mm = i.cover * 1000;
  const d_eff = h_mm - cover_mm - 1.5 * i.db;     // mm
  const d_m = d_eff / 1000;                        // m
  const d_prime = d_eff - i.db;                    // mm (top of bottom layer for orthogonal direction)
  const d_prime_m = d_prime / 1000;
  const beta1 = i.fc <= 28 ? 0.85 : Math.max(0.65, 0.85 - 0.05*(i.fc-28)/7);
  const Ab = Math.PI * i.db * i.db / 4;

  // X direction
  const lx = (i.L - i.c1) / 2;
  const Mu_x = qu_avg * i.B * lx * lx / 2;          // kN·m
  const Rn_x_kpa = Mu_x / (i.phi_flex * i.B * d_m * d_m);  // kPa
  const Rn_x = Rn_x_kpa / 1000;                              // MPa
  const rho_x = (0.85*i.fc/i.fy) * (1 - Math.sqrt(Math.max(0, 1 - 2*Rn_x/(0.85*i.fc))));
  const rho_design_x = Math.max(rho_x, i.rho_min);
  const As_req_x = rho_design_x * i.B * 1000 * d_eff;
  const Nx_calc = Math.ceil(As_req_x / Ab);
  const Nx_min = Math.ceil((i.B*1000 - 2*cover_mm) / i.s_max + 1);
  const Nx = Math.max(Nx_calc, Nx_min);
  const As_prov_x = Nx * Ab;
  const sx = Nx > 1 ? (i.B*1000 - 2*cover_mm) / (Nx - 1) : i.B*1000 - 2*cover_mm;
  const flex_x_status = As_prov_x >= i.rho_min*i.B*1000*d_eff ? "✓ SAFE" : "✗ NOT SAFE";
  const spacing_x_status = sx <= i.s_max ? "✓ OK" : "✗ ADD BARS";

  // Y direction
  const ly = (i.B - i.c2) / 2;
  const Mu_y = qu_avg * i.L * ly * ly / 2;
  const Rn_y_kpa = Mu_y / (i.phi_flex * i.L * d_prime_m * d_prime_m);
  const Rn_y = Rn_y_kpa / 1000;
  const rho_y = (0.85*i.fc/i.fy) * (1 - Math.sqrt(Math.max(0, 1 - 2*Rn_y/(0.85*i.fc))));
  const rho_design_y = Math.max(rho_y, i.rho_min);
  const As_req_y = rho_design_y * i.L * 1000 * d_prime;
  const Ny_calc = Math.ceil(As_req_y / Ab);
  const Ny_min = Math.ceil((i.L*1000 - 2*cover_mm) / i.s_max + 1);
  const Ny = Math.max(Ny_calc, Ny_min);
  const As_prov_y = Ny * Ab;
  const sy = Ny > 1 ? (i.L*1000 - 2*cover_mm) / (Ny - 1) : i.L*1000 - 2*cover_mm;
  const flex_y_status = As_prov_y >= i.rho_min*i.L*1000*d_prime ? "✓ SAFE" : "✗ NOT SAFE";
  const spacing_y_status = sy <= i.s_max ? "✓ OK" : "✗ ADD BARS";

  // ─── 5. ONE-WAY SHEAR ─────────────────────────────────────────────────────
  // X-direction (critical at d from face of column)
  const x_crit = Math.max(0, lx - d_m);
  const Vu_x = qu_avg * i.B * x_crit;
  const phiVc_x = i.phi_shear * 0.17 * i.lambda * Math.sqrt(i.fc) * i.B * 1000 * d_eff / 1000;
  const util_x = phiVc_x > 0 ? Vu_x / phiVc_x : 0;
  const status_x = Vu_x <= phiVc_x ? "✓ SAFE" : "✗ NOT SAFE — INCREASE h";

  // Y-direction (uses d' = d - db)
  const y_crit = Math.max(0, ly - d_prime_m);
  const Vu_y = qu_avg * i.L * y_crit;
  const phiVc_y = i.phi_shear * 0.17 * i.lambda * Math.sqrt(i.fc) * i.L * 1000 * d_prime / 1000;
  const util_y = phiVc_y > 0 ? Vu_y / phiVc_y : 0;
  const status_y = Vu_y <= phiVc_y ? "✓ SAFE" : "✗ NOT SAFE — INCREASE h";

  // ─── 6. PUNCHING (TWO-WAY) SHEAR ──────────────────────────────────────────
  const davg = (d_eff + d_prime) / 2;          // mm
  const davg_m = davg / 1000;
  const beta = Math.max(i.c1, i.c2) / Math.min(i.c1, i.c2);
  const alpha_s = i.colPosition === "Interior" ? 40 : i.colPosition === "Edge" ? 30 : 20;
  // bo per column position
  let bo: number;
  if (i.colPosition === "Interior") {
    bo = 2 * (i.c1 + davg_m) + 2 * (i.c2 + davg_m);
  } else if (i.colPosition === "Edge") {
    bo = (i.c1 + davg_m) + 2 * (i.c2 + davg_m) / 2;
  } else {
    bo = (i.c1 + davg_m)/2 + (i.c2 + davg_m)/2;
  }
  const A_crit = (i.c1 + davg_m) * (i.c2 + davg_m);
  const Vu_punch = P_max_ultimate - qu_avg * A_crit;
  const Vc1 = 0.33 * i.lambda * Math.sqrt(i.fc) * bo * 1000 * davg / 1000;
  const Vc2 = 0.17 * (1 + 2/beta) * i.lambda * Math.sqrt(i.fc) * bo * 1000 * davg / 1000;
  const Vc3 = 0.083 * (alpha_s * davg_m / bo + 2) * i.lambda * Math.sqrt(i.fc) * bo * 1000 * davg / 1000;
  const Vc_gov = Math.min(Vc1, Vc2, Vc3);
  const phiVc_punch = i.phi_shear * Vc_gov;
  const util_punch = phiVc_punch > 0 ? Vu_punch / phiVc_punch : 0;
  const status_punch = Vu_punch <= phiVc_punch ? "✓ SAFE" : "✗ NOT SAFE — INCREASE h";
  const h_recommended = util_punch <= 1 ? h_mm : h_mm * util_punch;

  // ─── 7. DETAILING ─────────────────────────────────────────────────────────
  const bar_length_x = i.L - 2*i.cover + 0.15;     // m (per bar in X direction, spans L)
  const bar_length_y = i.B - 2*i.cover + 0.15;
  const total_bar_length = Nx * bar_length_x + Ny * bar_length_y;  // m
  const unit_mass = 0.006165 * i.db * i.db;        // kg/m
  const total_mass = unit_mass * total_bar_length;
  const mass_with_lap = total_mass * 1.05;

  const ld = (i.fy * i.db) / (1.7 * i.lambda * Math.sqrt(i.fc));   // mm
  const la_avail = ((i.L - i.c1)/2 - i.cover) * 1000;              // mm
  const anchorage_status = ld <= la_avail ? "✓ OK — straight bar" : "⚠ Provide hook (90° bend)";

  // ─── 8. QUANTITIES ────────────────────────────────────────────────────────
  const conc_vol = i.L * i.B * i.h_ftg;
  const steel_mass = mass_with_lap;
  const formwork = 2 * (i.L + i.B) * i.h_ftg;       // m² (4 side faces)
  const excavation = i.L * i.B * i.Df;              // m³

  // ─── 9. OVERALL VERDICT ───────────────────────────────────────────────────
  const allPass =
    sizing_check.startsWith("✓") &&
    bearing_status.startsWith("✓") &&
    uplift_status.startsWith("✓") &&
    flex_x_status.startsWith("✓") &&
    flex_y_status.startsWith("✓") &&
    status_x.startsWith("✓") &&
    status_y.startsWith("✓") &&
    status_punch.startsWith("✓");
  const overall_verdict: "PASS" | "FAIL" = allPass ? "PASS" : "FAIL";

  return {
    inputs: i,
    loads: {
      service, ultimate,
      P_max_service, Mx_max_service, My_max_service,
      P_max_ultimate, Mx_max_ultimate, My_max_ultimate,
      gov_service_desc, gov_ultimate_desc,
    },
    sizing: {
      sw_per_m2, soil_per_m2, qa_eff,
      A_req, side_req, A_prov, sizing_check,
      ex, ey, L_over_6, B_over_6, middle_third_x, middle_third_y,
      Wf, Ws, sum_V, H_total, sliding_F, FS_sliding, sliding_status,
      MO, MR, FS_overturning, overturning_status,
    },
    pressure: {
      A: A_ftg, Sx: Sx_ftg, Sy: Sy_ftg,
      q1, q2, q3, q4, q_max, q_min,
      uplift_status, bearing_status, util,
      qu_avg, qu_max, qu_min,
    },
    flexure: {
      h_mm, cover_mm, d: d_eff, d_m, d_prime, d_prime_m, beta1,
      lx, Mu_x, Rn_x, rho_x, rho_design_x, As_req_x,
      Ab, Nx_calc, Nx_min, Nx, As_prov_x, sx, flex_x_status, spacing_x_status,
      ly, Mu_y, Rn_y, rho_y, rho_design_y, As_req_y,
      Ny_calc, Ny_min, Ny, As_prov_y, sy, flex_y_status, spacing_y_status,
    },
    oneWayShear: {
      Vu_x, phiVc_x, util_x, status_x,
      Vu_y, phiVc_y, util_y, status_y,
    },
    punching: {
      davg, davg_m, beta, alpha_s, bo, A_crit,
      Vu: Vu_punch, Vc1, Vc2, Vc3, Vc_gov,
      phiVc: phiVc_punch, util: util_punch, status: status_punch,
      h_recommended,
    },
    detail: {
      bar_length_x, bar_length_y, total_bar_length,
      unit_mass, total_mass, mass_with_lap,
      ld, la_avail, anchorage_status,
    },
    qty: { conc_vol, steel_mass, formwork, excavation },
    overall_verdict,
  };
}
