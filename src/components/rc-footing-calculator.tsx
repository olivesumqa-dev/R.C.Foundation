import { useState, useMemo, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Save, FolderOpen, FilePlus, Printer, FileDown, Layers } from "lucide-react";
import { SaveDialog, LoadDialog, readCalculations, writeCalculations, type StoredCalculation } from "./calculator-save-load";
import {
  computeFooting, fmt, DEFAULT_FOOTING_INPUTS,
  type FootingInputs, type FootingResults,
  type FootingType, type ColumnPosition,
} from "@/lib/calc-engine/rc-footing";

const CALC_TYPE = "rc_footing";

// Theme colors (matching beam/column)
const ACCENT = "#1e6cb8";
const ACCENT_DARK = "#0c2d57";
const ACCENT_LIGHT = "#7eb6ff";
const PAPER_BG = "#f1f3f5";
const CARD_BG = "#ffffff";
const RULE_LIGHT = "#d6dde4";
const RULE_DOT = "#e1e5ea";
const MUTED = "#5a6573";
const INK = "#0f1419";
const INPUT_BG = "#fff8d6";
const INPUT_BORDER = "#d4c896";

interface Props {
  onClose: () => void;
  title?: string;
}

export default function RCFootingCalculator({ onClose, title = "Isolated Footing Design" }: Props) {
  const [inputs, setInputs] = useState<FootingInputs>({
    ...DEFAULT_FOOTING_INPUTS,
    projDate: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
  });
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [currentName, setCurrentName] = useState("");
  const [currentFolder, setCurrentFolder] = useState("");
  const [showSave, setShowSave] = useState<null | "save" | "saveas">(null);
  const [showLoad, setShowLoad] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const results = useMemo<FootingResults>(() => computeFooting(inputs), [inputs]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !showSave && !showLoad) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, showSave, showLoad]);

  const setField = <K extends keyof FootingInputs>(key: K, value: FootingInputs[K]) =>
    setInputs((prev) => ({ ...prev, [key]: value }));

  // For Square footing, auto-keep B = L
  const setL = (v: string) => {
    const n = +v;
    if (inputs.ftgType === "Square") {
      setInputs((prev) => ({ ...prev, L: n, B: n }));
    } else {
      setField("L", n);
    }
  };

  const flash = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  const doSave = async (name: string, folder: string) => {
    const records = readCalculations(CALC_TYPE);
    const now = new Date().toISOString();
    let rec: StoredCalculation;

    if (showSave === "save" && currentId !== null) {
      const existing = records.find((item) => item.id === currentId);
      rec = {
        id: currentId,
        calcType: CALC_TYPE,
        name,
        folder,
        data: inputs,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      writeCalculations(CALC_TYPE, records.map((item) => item.id === currentId ? rec : item));
      flash(`Saved "${rec.name}"`);
    } else {
      rec = {
        id: Date.now(),
        calcType: CALC_TYPE,
        name,
        folder,
        data: inputs,
        createdAt: now,
        updatedAt: now,
      };
      writeCalculations(CALC_TYPE, [rec, ...records]);
      setCurrentId(rec.id);
      flash(`Saved as "${rec.name}"`);
    }

    setCurrentName(rec.name);
    setCurrentFolder(rec.folder);
  };

  const doLoad = async (id: number) => {
    const rec = readCalculations(CALC_TYPE).find((item) => item.id === id);
    if (!rec) { flash("Load failed."); return; }
    setInputs(rec.data as FootingInputs);
    setCurrentId(rec.id); setCurrentName(rec.name); setCurrentFolder(rec.folder);
    flash(`Loaded "${rec.name}"`);
  };

  const handleSaveClick = () => setShowSave(currentId !== null ? "save" : "saveas");
  const handleSaveAsClick = () => setShowSave("saveas");

  const handleNew = () => {
    if (!confirm("Clear current inputs and start a new calculation?")) return;
    setInputs({
      ...DEFAULT_FOOTING_INPUTS,
      projDate: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    });
    setCurrentId(null); setCurrentName(""); setCurrentFolder("");
  };

  const exportBOQ = () => {
    const r = results;
    const rows = [
      ["#", "Description", "Specification", "Quantity", "Unit"],
      ["1", "Excavation",
        `${r.inputs.L}×${r.inputs.B} m, ${r.inputs.Df} m deep`,
        r.qty.excavation.toFixed(2), "m³"],
      ["2", "Concrete, ready-mix",
        `f'c = ${r.inputs.fc} MPa, ${r.inputs.L}×${r.inputs.B}×${r.inputs.h_ftg} m`,
        r.qty.conc_vol.toFixed(3), "m³"],
      ["3", "Reinforcement (X-direction)",
        `${r.flexure.Nx} - φ${r.inputs.db}mm @ ${r.flexure.sx.toFixed(0)}mm o.c.`,
        (r.flexure.Nx * r.detail.bar_length_x).toFixed(2), "m"],
      ["4", "Reinforcement (Y-direction)",
        `${r.flexure.Ny} - φ${r.inputs.db}mm @ ${r.flexure.sy.toFixed(0)}mm o.c.`,
        (r.flexure.Ny * r.detail.bar_length_y).toFixed(2), "m"],
      ["5", "Total reinforcement mass (incl. 5% lap)",
        `fy = ${r.inputs.fy} MPa`,
        r.qty.steel_mass.toFixed(1), "kg"],
      ["6", "Formwork (sides)",
        "2(L+B)·h",
        r.qty.formwork.toFixed(2), "m²"],
    ];
    const csv = rows.map((row) => row.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `BOQ_${inputs.projMark || "footing"}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
    flash("BOQ exported");
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      style={{ background: PAPER_BG, color: INK }}
      className="rc-ftg-calc fixed inset-0 z-[110] overflow-y-auto"
    >
      {/* Toolbar */}
      <header
        style={{ background: ACCENT_DARK, borderBottom: `3px solid ${ACCENT}` }}
        className="sticky top-0 z-10 px-6 md:px-12 py-4 flex items-center justify-between no-print text-white"
      >
        <div className="flex items-center gap-4 min-w-0">
          <Layers className="w-5 h-5 shrink-0" style={{ color: ACCENT_LIGHT }} />
          <div className="min-w-0">
            <h1 className="font-serif text-xl truncate text-white">{title}</h1>
            <p className="font-sans text-[10px] tracking-widest uppercase" style={{ color: "#a8c5e8" }}>
              {currentName ? `${currentName}${currentFolder ? ` · ${currentFolder}` : ""}` : "NSCP 2015 / ACI 318-14"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ToolbarBtn onClick={handleNew} icon={<FilePlus className="w-3.5 h-3.5" />} label="New" />
          <ToolbarBtn onClick={handleSaveClick} icon={<Save className="w-3.5 h-3.5" />} label="Save" />
          <ToolbarBtn onClick={handleSaveAsClick} icon={<Save className="w-3.5 h-3.5" />} label="Save As" />
          <ToolbarBtn onClick={() => setShowLoad(true)} icon={<FolderOpen className="w-3.5 h-3.5" />} label="Load" />
          <ToolbarBtn onClick={exportBOQ} icon={<FileDown className="w-3.5 h-3.5" />} label="BOQ" />
          <ToolbarBtn onClick={() => window.print()} icon={<Printer className="w-3.5 h-3.5" />} label="Print" primary />
          <button onClick={onClose}
            className="ml-2 p-2 rounded transition-colors text-white hover:bg-white/10" title="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[440px_1fr] gap-0 min-h-[calc(100vh-65px)]">
        {/* Inputs */}
        <aside style={{ background: CARD_BG, borderRight: `1px solid ${RULE_LIGHT}` }} className="p-6 lg:p-8 no-print">
          <SectionLabel>Project</SectionLabel>
          <div className="grid grid-cols-2 gap-3 mb-5">
            <Field label="Project" value={inputs.projName} onChange={(v) => setField("projName", v)} text />
            <Field label="Footing Mark" value={inputs.projMark} onChange={(v) => setField("projMark", v)} text />
            <Field label="Designed By" value={inputs.projBy} onChange={(v) => setField("projBy", v)} text />
            <Field label="Date" value={inputs.projDate} onChange={(v) => setField("projDate", v)} text />
          </div>

          <SectionLabel>Design Options</SectionLabel>
          <Select label="Footing Type" value={inputs.ftgType}
            onChange={(v) => {
              const t = v as FootingType;
              setInputs(p => t === "Square" ? { ...p, ftgType: t, B: p.L } : { ...p, ftgType: t });
            }}
            options={["Square", "Rectangular"]} />
          <Select label="Column Position" value={inputs.colPosition}
            onChange={(v) => setField("colPosition", v as ColumnPosition)}
            options={["Interior", "Edge", "Corner"]} />

          <SectionLabel>Service Loads</SectionLabel>
          <Field label="Dead, PD" unit="kN" value={inputs.PD} onChange={(v) => setField("PD", +v)} />
          <Field label="Live, PL" unit="kN" value={inputs.PL} onChange={(v) => setField("PL", +v)} />
          <Field label="Roof Live, PLr" unit="kN" value={inputs.PLr} onChange={(v) => setField("PLr", +v)} />
          <Field label="Wind, PW" unit="kN" value={inputs.PW} onChange={(v) => setField("PW", +v)} />
          <Field label="Seismic, PE" unit="kN" value={inputs.PE} onChange={(v) => setField("PE", +v)} />
          <Field label="Moment Mx" unit="kN·m" value={inputs.Mx_s} onChange={(v) => setField("Mx_s", +v)} />
          <Field label="Moment My" unit="kN·m" value={inputs.My_s} onChange={(v) => setField("My_s", +v)} />
          <Field label="Horizontal Hx" unit="kN" value={inputs.Hx} onChange={(v) => setField("Hx", +v)} />
          <Field label="Horizontal Hy" unit="kN" value={inputs.Hy} onChange={(v) => setField("Hy", +v)} />

          <SectionLabel>Column / Pedestal</SectionLabel>
          <Field label="Column c1 (x)" unit="m" value={inputs.c1} onChange={(v) => setField("c1", +v)} step={0.05} />
          <Field label="Column c2 (y)" unit="m" value={inputs.c2} onChange={(v) => setField("c2", +v)} step={0.05} />

          <SectionLabel>Footing Dimensions</SectionLabel>
          <Field label={`Length L (${inputs.ftgType === "Square" ? "= B" : "x-dir"})`} unit="m"
            value={inputs.L} onChange={setL} step={0.1} />
          {inputs.ftgType === "Rectangular" && (
            <Field label="Width B (y-dir)" unit="m" value={inputs.B} onChange={(v) => setField("B", +v)} step={0.1} />
          )}
          <Field label="Thickness h" unit="m" value={inputs.h_ftg} onChange={(v) => setField("h_ftg", +v)} step={0.05} />
          <Field label="Cover (bottom)" unit="m" value={inputs.cover} onChange={(v) => setField("cover", +v)} step={0.005} />
          <Field label="Bar Ø, db" unit="mm" value={inputs.db} onChange={(v) => setField("db", +v)} />

          <SectionLabel>Materials</SectionLabel>
          <Field label="Concrete, f'c" unit="MPa" value={inputs.fc} onChange={(v) => setField("fc", +v)} />
          <Field label="Steel yield, fy" unit="MPa" value={inputs.fy} onChange={(v) => setField("fy", +v)} />
          <Field label="γc" unit="kN/m³" value={inputs.gamma_c} onChange={(v) => setField("gamma_c", +v)} />
          <Field label="γs (soil)" unit="kN/m³" value={inputs.gamma_s} onChange={(v) => setField("gamma_s", +v)} />

          <SectionLabel>Soil</SectionLabel>
          <Field label="Allowable bearing, qa" unit="kPa" value={inputs.qa} onChange={(v) => setField("qa", +v)} />
          <Field label="Surcharge, qs" unit="kPa" value={inputs.qs} onChange={(v) => setField("qs", +v)} step={0.5} />
          <Field label="Embedment Df" unit="m" value={inputs.Df} onChange={(v) => setField("Df", +v)} step={0.1} />
          <Field label="Friction μ" value={inputs.mu_soil} onChange={(v) => setField("mu_soil", +v)} step={0.05} />

          <p className="font-sans text-[10px] leading-relaxed mt-6 pt-4"
            style={{ color: MUTED, borderTop: `1px solid ${RULE_LIGHT}` }}>
            All results update live. For Square footings, B follows L automatically.
            Cover ≥ 75 mm for cast-against-earth surfaces (NSCP 420.6.1.3.1).
          </p>
        </aside>

        {/* Results */}
        <main style={{ background: PAPER_BG }} className="p-6 lg:p-10 print-area">
          {/* Print header */}
          <div className="hidden print:block pb-3 mb-5" style={{ borderBottom: `2px solid ${ACCENT_DARK}` }}>
            <h2 className="font-serif text-2xl" style={{ color: ACCENT_DARK }}>ISOLATED FOOTING DESIGN</h2>
            <p className="font-sans text-xs mt-1" style={{ color: MUTED }}>
              {inputs.projName} &nbsp;|&nbsp; Footing {inputs.projMark} &nbsp;|&nbsp;
              Designed By: {inputs.projBy} &nbsp;|&nbsp; {inputs.projDate}
            </p>
            <p className="font-sans text-xs" style={{ color: MUTED }}>
              Per NSCP 2015 / ACI 318-14 — Ultimate Strength Design (USD)
            </p>
          </div>

          {/* Headline */}
          <SectionLabel>Headline Results</SectionLabel>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <HeadlineCard label="Pu (factored)" value={fmt(results.loads.P_max_ultimate, 1)} unit="kN"
              sub={`qu = ${fmt(results.pressure.qu_avg, 1)} kPa`} />
            <HeadlineCard label="Section" value={`${results.inputs.L}×${results.inputs.B}×${results.inputs.h_ftg}`} small unit="m"
              sub={`d = ${fmt(results.flexure.d, 0)} mm`} />
            <HeadlineCard label="Reinforcement" value={`${results.flexure.Nx}×${results.flexure.Ny}`} small
              sub={`φ${inputs.db}mm bars (X×Y)`} />
            <HeadlineCard label="Verdict" value={results.overall_verdict} small
              sub={`${results.inputs.colPosition} column`}
              statusBg={results.overall_verdict === "PASS" ? "#d4edda" : "#f8d7da"}
              statusFg={results.overall_verdict === "PASS" ? "#155724" : "#721c24"} />
          </div>

          {/* Plan drawing */}
          <ResultBlock title="Footing Plan View (top)">
            <FootingPlanSVG results={results} />
          </ResultBlock>

          {/* Load combinations */}
          <ResultBlock title="1. Load Combinations (NSCP 203 / ACI 5.3)">
            <h4 className="font-sans text-[11px] tracking-widest uppercase mb-2 mt-1" style={{ color: ACCENT_DARK }}>
              Service Loads (for bearing check)
            </h4>
            <ComboTable combos={results.loads.service} />
            <h4 className="font-sans text-[11px] tracking-widest uppercase mb-2 mt-5" style={{ color: ACCENT_DARK }}>
              Ultimate Loads (for strength design)
            </h4>
            <ComboTable combos={results.loads.ultimate} />
            <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${RULE_DOT}` }}>
              <Row label="Max service P (bearing)" val={fmt(results.loads.P_max_service, 2)} unit="kN" bold />
              <Row label="Max factored Pu (strength)" val={fmt(results.loads.P_max_ultimate, 2)} unit="kN" bold />
            </div>
          </ResultBlock>

          {/* Sizing & stability */}
          <ResultBlock title="2. Footing Sizing & Stability">
            <Row label="Self-weight per m² (γc·h)" val={fmt(results.sizing.sw_per_m2, 2)} unit="kPa" />
            <Row label="Soil per m² (γs·(Df−h))" val={fmt(results.sizing.soil_per_m2, 2)} unit="kPa" />
            <Row label="Effective allowable bearing qa,eff" val={fmt(results.sizing.qa_eff, 2)} unit="kPa" />
            <Row label="Required area A_req = P/qa,eff" val={fmt(results.sizing.A_req, 3)} unit="m²" />
            <Row label="Required side √A" val={fmt(results.sizing.side_req, 3)} unit="m" />
            <Row label="Provided area L × B" val={fmt(results.sizing.A_prov, 3)} unit="m²" />
            <Row label="Sizing check" val={results.sizing.sizing_check} bold />
            <Row label="Eccentricity ex = Mx/P" val={fmt(results.sizing.ex, 4)} unit="m" />
            <Row label="Eccentricity ey = My/P" val={fmt(results.sizing.ey, 4)} unit="m" />
            <Row label="L/6 limit" val={fmt(results.sizing.L_over_6, 4)} unit="m" />
            <Row label="Middle-third check X" val={results.sizing.middle_third_x} />
            <Row label="Middle-third check Y" val={results.sizing.middle_third_y} />
            <Row label="Footing weight Wf" val={fmt(results.sizing.Wf, 2)} unit="kN" />
            <Row label="Soil weight Ws (above ftg)" val={fmt(results.sizing.Ws, 2)} unit="kN" />
            <Row label="Total vertical ΣV" val={fmt(results.sizing.sum_V, 2)} unit="kN" />
            <Row label="Horizontal resultant H" val={fmt(results.sizing.H_total, 2)} unit="kN" />
            <Row label="Sliding resistance F = μ·ΣV" val={fmt(results.sizing.sliding_F, 2)} unit="kN" />
            <Row label="FS sliding (≥ 1.5)"
              val={typeof results.sizing.FS_sliding === "number" ? fmt(results.sizing.FS_sliding, 3) : results.sizing.FS_sliding} />
            <Row label="Sliding status" val={results.sizing.sliding_status} />
            <Row label="Overturning moment MO" val={fmt(results.sizing.MO, 2)} unit="kN·m" />
            <Row label="Restoring moment MR" val={fmt(results.sizing.MR, 2)} unit="kN·m" />
            <Row label="FS overturning (≥ 2.0)"
              val={typeof results.sizing.FS_overturning === "number" ? fmt(results.sizing.FS_overturning, 3) : results.sizing.FS_overturning} />
            <Row label="Overturning status" val={results.sizing.overturning_status} />
          </ResultBlock>

          {/* Soil pressure */}
          <ResultBlock title="3. Soil Pressure Analysis">
            <Row label="Footing area A" val={fmt(results.pressure.A, 3)} unit="m²" />
            <Row label="Section modulus Sx" val={fmt(results.pressure.Sx, 4)} unit="m³" />
            <Row label="Section modulus Sy" val={fmt(results.pressure.Sy, 4)} unit="m³" />
            <Row label="Corner pressure q1 (+L/2, +B/2)" val={fmt(results.pressure.q1, 3)} unit="kPa" />
            <Row label="Corner pressure q2 (+L/2, −B/2)" val={fmt(results.pressure.q2, 3)} unit="kPa" />
            <Row label="Corner pressure q3 (−L/2, +B/2)" val={fmt(results.pressure.q3, 3)} unit="kPa" />
            <Row label="Corner pressure q4 (−L/2, −B/2)" val={fmt(results.pressure.q4, 3)} unit="kPa" />
            <Row label="q_max" val={fmt(results.pressure.q_max, 3)} unit="kPa" bold />
            <Row label="q_min" val={fmt(results.pressure.q_min, 3)} unit="kPa" bold />
            <Row label="Uplift check (q_min ≥ 0)" val={results.pressure.uplift_status} />
            <Row label="Bearing check (q_max ≤ qa)" val={results.pressure.bearing_status} />
            <Row label="Utilization q_max / qa" val={fmt(results.pressure.util, 3)} />
            <Row label="Factored avg pressure qu" val={fmt(results.pressure.qu_avg, 2)} unit="kPa" />
            <Row label="Factored max pressure qu,max" val={fmt(results.pressure.qu_max, 2)} unit="kPa" />
            <Row label="Factored min pressure qu,min" val={fmt(results.pressure.qu_min, 2)} unit="kPa" />
          </ResultBlock>

          {/* Flexural design X */}
          <ResultBlock title="4. Flexural Design — X direction (bars parallel to L)">
            <Row label="Effective depth d = h − cc − 1.5db" val={fmt(results.flexure.d, 0)} unit="mm" />
            <Row label="Cantilever ℓx = (L − c1)/2" val={fmt(results.flexure.lx, 3)} unit="m" />
            <Row label="Factored moment Mux = qu·B·ℓx²/2" val={fmt(results.flexure.Mu_x, 3)} unit="kN·m" />
            <Row label="Rn = Mu/(φ·b·d²)" val={fmt(results.flexure.Rn_x, 4)} unit="MPa" />
            <Row label="Required ρ" val={fmt(results.flexure.rho_x, 5)} />
            <Row label="Design ρ (≥ ρmin)" val={fmt(results.flexure.rho_design_x, 5)} />
            <Row label="Required As" val={fmt(results.flexure.As_req_x, 1)} unit="mm²" />
            <Row label="Bar area Ab = π·db²/4" val={fmt(results.flexure.Ab, 1)} unit="mm²" />
            <Row label="Nx by As / Ab" val={String(results.flexure.Nx_calc)} unit="bars" />
            <Row label="Nx by max spacing limit" val={String(results.flexure.Nx_min)} unit="bars" />
            <Row label="Provided Nx" val={String(results.flexure.Nx)} unit="bars" bold />
            <Row label="As provided" val={fmt(results.flexure.As_prov_x, 1)} unit="mm²" />
            <Row label="Spacing sx" val={fmt(results.flexure.sx, 1)} unit="mm" />
            <Row label="Spacing check (≤ smax)" val={results.flexure.spacing_x_status} />
            <Row label="Flexure X status" val={results.flexure.flex_x_status} bold />
          </ResultBlock>

          {/* Flexural design Y */}
          <ResultBlock title="5. Flexural Design — Y direction (bars parallel to B)">
            <Row label="Effective depth d' = d − db" val={fmt(results.flexure.d_prime, 0)} unit="mm" />
            <Row label="Cantilever ℓy = (B − c2)/2" val={fmt(results.flexure.ly, 3)} unit="m" />
            <Row label="Factored moment Muy = qu·L·ℓy²/2" val={fmt(results.flexure.Mu_y, 3)} unit="kN·m" />
            <Row label="Rn" val={fmt(results.flexure.Rn_y, 4)} unit="MPa" />
            <Row label="Required ρ" val={fmt(results.flexure.rho_y, 5)} />
            <Row label="Design ρ" val={fmt(results.flexure.rho_design_y, 5)} />
            <Row label="Required As" val={fmt(results.flexure.As_req_y, 1)} unit="mm²" />
            <Row label="Ny by As / Ab" val={String(results.flexure.Ny_calc)} unit="bars" />
            <Row label="Ny by max spacing" val={String(results.flexure.Ny_min)} unit="bars" />
            <Row label="Provided Ny" val={String(results.flexure.Ny)} unit="bars" bold />
            <Row label="As provided" val={fmt(results.flexure.As_prov_y, 1)} unit="mm²" />
            <Row label="Spacing sy" val={fmt(results.flexure.sy, 1)} unit="mm" />
            <Row label="Spacing check" val={results.flexure.spacing_y_status} />
            <Row label="Flexure Y status" val={results.flexure.flex_y_status} bold />
          </ResultBlock>

          {/* One-way shear */}
          <ResultBlock title="6. One-Way (Beam) Shear Check — NSCP 422.5">
            <h4 className="font-sans text-[11px] tracking-widest uppercase mb-2 mt-1" style={{ color: ACCENT_DARK }}>X-direction</h4>
            <Row label="Vu = qu·B·(ℓx − d)" val={fmt(results.oneWayShear.Vu_x, 3)} unit="kN" />
            <Row label="φVc = 0.75·0.17·λ·√f'c·b·d" val={fmt(results.oneWayShear.phiVc_x, 3)} unit="kN" />
            <Row label="Utilization Vu/φVc" val={fmt(results.oneWayShear.util_x, 4)} />
            <Row label="Status X" val={results.oneWayShear.status_x} bold />
            <h4 className="font-sans text-[11px] tracking-widest uppercase mb-2 mt-4" style={{ color: ACCENT_DARK }}>Y-direction</h4>
            <Row label="Vu = qu·L·(ℓy − d')" val={fmt(results.oneWayShear.Vu_y, 3)} unit="kN" />
            <Row label="φVc" val={fmt(results.oneWayShear.phiVc_y, 3)} unit="kN" />
            <Row label="Utilization" val={fmt(results.oneWayShear.util_y, 4)} />
            <Row label="Status Y" val={results.oneWayShear.status_y} bold />
          </ResultBlock>

          {/* Punching shear */}
          <ResultBlock title="7. Two-Way (Punching) Shear Check — NSCP 422.6">
            <Row label="Average effective depth davg" val={fmt(results.punching.davg, 1)} unit="mm" />
            <Row label="β = long side / short side" val={fmt(results.punching.beta, 3)} />
            <Row label={`αs (${inputs.colPosition})`} val={String(results.punching.alpha_s)} />
            <Row label="Critical perimeter bo" val={fmt(results.punching.bo, 3)} unit="m" />
            <Row label="Critical area A_crit" val={fmt(results.punching.A_crit, 4)} unit="m²" />
            <Row label="Factored shear Vu = Pu − qu·A_crit" val={fmt(results.punching.Vu, 3)} unit="kN" />
            <Row label="Vc1 = 0.33·λ·√f'c·bo·d" val={fmt(results.punching.Vc1, 3)} unit="kN" />
            <Row label="Vc2 = 0.17·(1 + 2/β)·λ·√f'c·bo·d" val={fmt(results.punching.Vc2, 3)} unit="kN" />
            <Row label="Vc3 = 0.083·(αs·d/bo + 2)·λ·√f'c·bo·d" val={fmt(results.punching.Vc3, 3)} unit="kN" />
            <Row label="Vc governing (min)" val={fmt(results.punching.Vc_gov, 3)} unit="kN" bold />
            <Row label="φVc" val={fmt(results.punching.phiVc, 3)} unit="kN" />
            <Row label="Utilization Vu/φVc" val={fmt(results.punching.util, 4)} />
            <Row label="Punching status" val={results.punching.status} bold />
            <Row label="Recommended thickness h" val={fmt(results.punching.h_recommended, 0)} unit="mm" />
          </ResultBlock>

          {/* Detailing */}
          <ResultBlock title="8. Reinforcement Detailing">
            <Row label="Bar length X (per bar)" val={fmt(results.detail.bar_length_x, 3)} unit="m" />
            <Row label="Bar length Y (per bar)" val={fmt(results.detail.bar_length_y, 3)} unit="m" />
            <Row label="Total bar length" val={fmt(results.detail.total_bar_length, 2)} unit="m" />
            <Row label="Unit mass (kg/m)" val={fmt(results.detail.unit_mass, 4)} />
            <Row label="Total reinforcement mass" val={fmt(results.detail.total_mass, 2)} unit="kg" />
            <Row label="Mass with 5% lap allowance" val={fmt(results.detail.mass_with_lap, 2)} unit="kg" />
            <Row label="Development length ld" val={fmt(results.detail.ld, 1)} unit="mm" />
            <Row label="Available anchorage ℓa" val={fmt(results.detail.la_avail, 1)} unit="mm" />
            <Row label="Anchorage check" val={results.detail.anchorage_status} />
          </ResultBlock>

          {/* BOQ */}
          <ResultBlock title="9. Bill of Quantities">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr style={{ background: ACCENT_DARK, color: "#fff" }}>
                  <th className="text-left px-3 py-2 font-sans text-[10px] tracking-widest uppercase">#</th>
                  <th className="text-left px-3 py-2 font-sans text-[10px] tracking-widest uppercase">Description</th>
                  <th className="text-left px-3 py-2 font-sans text-[10px] tracking-widest uppercase">Spec</th>
                  <th className="text-right px-3 py-2 font-sans text-[10px] tracking-widest uppercase">Qty</th>
                  <th className="text-left px-3 py-2 font-sans text-[10px] tracking-widest uppercase">Unit</th>
                </tr>
              </thead>
              <tbody className="font-sans text-xs">
                <BOQRow n="1" desc="Excavation" spec={`${inputs.L}×${inputs.B}, ${inputs.Df}m deep`} qty={fmt(results.qty.excavation, 2)} unit="m³" />
                <BOQRow n="2" desc="Concrete, ready-mix" spec={`f'c = ${inputs.fc} MPa`} qty={fmt(results.qty.conc_vol, 3)} unit="m³" />
                <BOQRow n="3" desc="Rebar X-direction" spec={`${results.flexure.Nx} - φ${inputs.db}mm @ ${results.flexure.sx.toFixed(0)}mm o.c.`} qty={fmt(results.flexure.Nx * results.detail.bar_length_x, 2)} unit="m" />
                <BOQRow n="4" desc="Rebar Y-direction" spec={`${results.flexure.Ny} - φ${inputs.db}mm @ ${results.flexure.sy.toFixed(0)}mm o.c.`} qty={fmt(results.flexure.Ny * results.detail.bar_length_y, 2)} unit="m" />
                <BOQRow n="5" desc="Total reinforcement (incl. 5% lap)" spec={`fy = ${inputs.fy} MPa`} qty={fmt(results.qty.steel_mass, 1)} unit="kg" />
                <BOQRow n="6" desc="Formwork (sides)" spec="2(L+B)·h" qty={fmt(results.qty.formwork, 2)} unit="m²" />
              </tbody>
            </table>
          </ResultBlock>

          {/* Summary */}
          <ResultBlock title="10. Design Summary & Certification">
            <Row label="Footing mark" val={inputs.projMark} />
            <Row label="Type" val={`${inputs.ftgType} (${inputs.colPosition} column)`} />
            <Row label="Plan size" val={`${inputs.L} × ${inputs.B} m`} />
            <Row label="Thickness" val={`${inputs.h_ftg} m`} />
            <Row label="Reinforcement X (bottom)" val={`${results.flexure.Nx} - φ${inputs.db}mm @ ${results.flexure.sx.toFixed(0)}mm o.c.`} />
            <Row label="Reinforcement Y (bottom)" val={`${results.flexure.Ny} - φ${inputs.db}mm @ ${results.flexure.sy.toFixed(0)}mm o.c.`} />
            <Row label="Sizing" val={<StatusPill status={results.sizing.sizing_check.startsWith("✓") ? "PASS" : "FAIL"} />} />
            <Row label="Bearing" val={<StatusPill status={results.pressure.bearing_status.startsWith("✓") ? "PASS" : "FAIL"} />} />
            <Row label="Flexure X" val={<StatusPill status={results.flexure.flex_x_status.startsWith("✓") ? "PASS" : "FAIL"} />} />
            <Row label="Flexure Y" val={<StatusPill status={results.flexure.flex_y_status.startsWith("✓") ? "PASS" : "FAIL"} />} />
            <Row label="One-way shear X" val={<StatusPill status={results.oneWayShear.status_x.startsWith("✓") ? "PASS" : "FAIL"} />} />
            <Row label="One-way shear Y" val={<StatusPill status={results.oneWayShear.status_y.startsWith("✓") ? "PASS" : "FAIL"} />} />
            <Row label="Punching shear" val={<StatusPill status={results.punching.status.startsWith("✓") ? "PASS" : "FAIL"} />} />
            <Row label="OVERALL VERDICT" val={<StatusPill status={results.overall_verdict} />} bold />
            <p className="font-sans text-[11px] italic leading-relaxed mt-4" style={{ color: MUTED }}>
              Design performed per NSCP 2015 / ACI 318-14 using Ultimate Strength Design (USD).
              Includes service-load bearing check, ultimate-load flexural design in both directions,
              one-way (beam) shear at d from face of column, and two-way (punching) shear at d/2 from
              face of column using three concrete strength formulas (governing minimum). Detailing
              per ACI Ch. 25.
            </p>
          </ResultBlock>

          <div className="h-12" />
        </main>
      </div>

      <AnimatePresence>
        {showSave && (
          <SaveDialog mode={showSave} currentName={currentName} currentFolder={currentFolder}
            onSave={doSave} onClose={() => setShowSave(null)} />
        )}
        {showLoad && (
          <LoadDialog calcType={CALC_TYPE} onLoad={doLoad} onClose={() => setShowLoad(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            style={{ background: ACCENT_DARK, color: "#fff" }}
            className="fixed bottom-6 right-6 z-[130] px-4 py-2.5 rounded font-sans text-xs tracking-widest uppercase shadow-lg no-print">
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
        @media print {
          @page { margin: 15mm; size: A4; }
          .no-print { display: none !important; }
          .print-area { padding: 0 !important; }
        }
      `}</style>
    </motion.div>
  );
}

// ───── Helpers ───────────────────────────────────────────────────────────────

function ToolbarBtn({ onClick, icon, label, primary }: {
  onClick: () => void; icon: React.ReactNode; label: string; primary?: boolean;
}) {
  return (
    <button onClick={onClick}
      style={primary
        ? { background: "#ffffff", color: ACCENT_DARK }
        : { background: "rgba(255,255,255,0.08)", color: "#ffffff", border: "1px solid rgba(255,255,255,0.2)" }
      }
      className="inline-flex items-center gap-1.5 font-sans text-[10px] tracking-widest uppercase px-3 py-2 rounded transition-all hover:opacity-90">
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="font-sans text-[11px] font-semibold tracking-widest uppercase pb-1.5 mt-5 first:mt-0 mb-2.5"
      style={{ color: ACCENT_DARK, borderBottom: `2px solid ${ACCENT_DARK}` }}>
      {children}
    </div>
  );
}

function Field({ label, value, onChange, unit, step, text }: {
  label: string; value: string | number; onChange: (v: string) => void;
  unit?: string; step?: number; text?: boolean;
}) {
  return (
    <div className="grid grid-cols-[1fr_92px] items-center gap-2 py-1" style={{ borderBottom: `1px dotted ${RULE_DOT}` }}>
      <label className="font-sans text-xs" style={{ color: INK }}>{label}</label>
      <div className="flex items-center gap-1.5">
        <input
          type={text ? "text" : "number"}
          step={step}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ background: INPUT_BG, border: `1px solid ${INPUT_BORDER}`, color: INK }}
          className="w-full rounded px-2 py-1 font-mono text-xs text-right focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        {unit && <span className="font-mono text-[10px] w-10" style={{ color: MUTED }}>{unit}</span>}
      </div>
    </div>
  );
}

function Select({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: string[];
}) {
  return (
    <div className="py-1.5" style={{ borderBottom: `1px dotted ${RULE_DOT}` }}>
      <label className="font-sans text-xs block mb-1" style={{ color: INK }}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        style={{ background: INPUT_BG, border: `1px solid ${INPUT_BORDER}`, color: INK }}
        className="w-full rounded px-2 py-1 font-sans text-xs focus:outline-none focus:ring-2 focus:ring-blue-500">
        {options.map((o) => <option key={o}>{o}</option>)}
      </select>
    </div>
  );
}

function HeadlineCard({ label, value, unit, sub, small, statusBg, statusFg }: {
  label: string; value: string; unit?: string; sub?: string; small?: boolean;
  statusBg?: string; statusFg?: string;
}) {
  return (
    <div className="rounded p-3 text-center"
      style={{ background: statusBg ?? CARD_BG, border: `1px solid ${RULE_LIGHT}`, boxShadow: "0 1px 3px rgba(12,45,87,0.05)" }}>
      <div className="font-sans text-[9px] tracking-widest uppercase" style={{ color: MUTED }}>{label}</div>
      <div className={`font-mono font-semibold mt-1 ${small ? "text-base" : "text-2xl"}`}
        style={{ color: statusFg ?? ACCENT_DARK }}>{value}</div>
      {unit && <div className="font-mono text-[10px]" style={{ color: MUTED }}>{unit}</div>}
      {sub && <div className="font-sans text-[10px] mt-0.5" style={{ color: MUTED }}>{sub}</div>}
    </div>
  );
}

function ResultBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5 rounded p-5"
      style={{ background: CARD_BG, border: `1px solid ${RULE_LIGHT}`, boxShadow: "0 1px 3px rgba(12,45,87,0.05)" }}>
      <h3 className="font-sans text-[11px] font-semibold tracking-widest uppercase mb-3 pb-1.5"
        style={{ color: ACCENT_DARK, borderBottom: `1.5px solid ${ACCENT_DARK}` }}>{title}</h3>
      {children}
    </section>
  );
}

function Row({ label, val, unit, formula, bold }: {
  label: string; val: React.ReactNode; unit?: string; formula?: string; bold?: boolean;
}) {
  return (
    <div className="grid grid-cols-[1fr_auto_50px] gap-2 items-baseline py-1.5 last:border-b-0"
      style={{ borderBottom: `1px dotted ${RULE_DOT}` }}>
      <span className="font-sans text-xs"
        style={{ color: bold ? ACCENT_DARK : INK, fontWeight: bold ? 600 : 400 }}
        dangerouslySetInnerHTML={{ __html: label }} />
      <span className="font-mono text-xs"
        style={{ color: bold ? ACCENT_DARK : INK, fontWeight: bold ? 600 : 500 }}>{val}</span>
      <span className="font-mono text-[10px]" style={{ color: MUTED }}>{unit ?? ""}</span>
      {formula && <span className="col-span-3 font-sans text-[10px] italic pl-3" style={{ color: "#8590a0" }}>{formula}</span>}
    </div>
  );
}

function StatusPill({ status, label }: { status: "PASS" | "FAIL"; label?: string }) {
  return (
    <span className="inline-block px-2.5 py-1 rounded text-[10px] font-bold tracking-widest font-sans"
      style={status === "PASS"
        ? { background: "#d4edda", color: "#155724", border: "1px solid #c3e6cb" }
        : { background: "#f8d7da", color: "#721c24", border: "1px solid #f5c6cb" }
      }>
      {label ?? (status === "PASS" ? "✓ PASS" : "✗ FAIL")}
    </span>
  );
}

function BOQRow({ n, desc, spec, qty, unit }: { n: string; desc: string; spec: string; qty: string; unit: string }) {
  return (
    <tr style={{ borderBottom: `1px solid ${RULE_DOT}` }}>
      <td className="px-3 py-2" style={{ color: MUTED }}>{n}</td>
      <td className="px-3 py-2" style={{ color: INK }}>{desc}</td>
      <td className="px-3 py-2 text-[11px]" style={{ color: MUTED }}>{spec}</td>
      <td className="px-3 py-2 text-right font-mono" style={{ color: ACCENT_DARK, fontWeight: 600 }}>{qty}</td>
      <td className="px-3 py-2" style={{ color: MUTED }}>{unit}</td>
    </tr>
  );
}

function ComboTable({ combos }: { combos: { id: string; desc: string; P: number; Mx: number; My: number; governs?: boolean }[] }) {
  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr style={{ background: ACCENT_DARK, color: "#fff" }}>
          <th className="px-2 py-1.5 text-left font-sans text-[10px] tracking-widest uppercase">#</th>
          <th className="px-2 py-1.5 text-left font-sans text-[10px] tracking-widest uppercase">Combination</th>
          <th className="px-2 py-1.5 text-right font-sans text-[10px] tracking-widest uppercase">P (kN)</th>
          <th className="px-2 py-1.5 text-right font-sans text-[10px] tracking-widest uppercase">Mx (kN·m)</th>
          <th className="px-2 py-1.5 text-right font-sans text-[10px] tracking-widest uppercase">My (kN·m)</th>
        </tr>
      </thead>
      <tbody>
        {combos.map((c) => (
          <tr key={c.id} style={{
            background: c.governs ? "#fff3cd" : undefined,
            borderBottom: `1px solid ${RULE_DOT}`,
            fontWeight: c.governs ? 600 : 400,
          }}>
            <td className="px-2 py-1.5" style={{ color: MUTED }}>{c.id}</td>
            <td className="px-2 py-1.5">{c.desc}{c.governs && <span style={{ color: ACCENT, marginLeft: 8, fontSize: "10px", letterSpacing: "1px" }}>← GOVERNING</span>}</td>
            <td className="px-2 py-1.5 text-right font-mono">{fmt(c.P, 2)}</td>
            <td className="px-2 py-1.5 text-right font-mono">{fmt(c.Mx, 2)}</td>
            <td className="px-2 py-1.5 text-right font-mono">{fmt(c.My, 2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ───── Footing plan SVG (top-down view) ─────────────────────────────────────

function FootingPlanSVG({ results }: { results: FootingResults }) {
  const i = results.inputs;
  const W = 540, H = 420;
  const margin = 70;
  const scale = Math.min((W - 2 * margin) / i.L, (H - 2 * margin) / i.B);

  const fw = i.L * scale;
  const fh = i.B * scale;
  const x0 = (W - fw) / 2;
  const y0 = (H - fh) / 2;

  // Column position within footing
  const cw = i.c1 * scale;
  const ch = i.c2 * scale;
  const cx = (W - cw) / 2;
  const cy = (H - ch) / 2;

  // Rebar X (parallel to L, distributed along B)
  const Nx = results.flexure.Nx;
  const Ny = results.flexure.Ny;
  const cover_s = i.cover * scale;

  const xBars: React.JSX.Element[] = [];
  for (let k = 0; k < Nx; k++) {
    const t = Nx === 1 ? 0.5 : k / (Nx - 1);
    const yLine = y0 + cover_s + t * (fh - 2 * cover_s);
    xBars.push(
      <line key={`xb${k}`} x1={x0 + cover_s} y1={yLine} x2={x0 + fw - cover_s} y2={yLine}
        stroke={ACCENT} strokeWidth="0.8" opacity="0.55" />
    );
  }
  const yBars: React.JSX.Element[] = [];
  for (let k = 0; k < Ny; k++) {
    const t = Ny === 1 ? 0.5 : k / (Ny - 1);
    const xLine = x0 + cover_s + t * (fw - 2 * cover_s);
    yBars.push(
      <line key={`yb${k}`} x1={xLine} y1={y0 + cover_s} x2={xLine} y2={y0 + fh - cover_s}
        stroke="#c0392b" strokeWidth="0.8" opacity="0.55" />
    );
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-md mx-auto" xmlns="http://www.w3.org/2000/svg">
      {/* Footing outline */}
      <rect x={x0} y={y0} width={fw} height={fh} fill="#ede8d8" stroke={ACCENT_DARK} strokeWidth="1.5" />
      {/* Cover line */}
      <rect x={x0 + cover_s} y={y0 + cover_s} width={fw - 2 * cover_s} height={fh - 2 * cover_s}
        fill="none" stroke={ACCENT_DARK} strokeWidth="0.5" strokeDasharray="3 2" opacity="0.4" />
      {/* Rebar */}
      {xBars}
      {yBars}
      {/* Column */}
      <rect x={cx} y={cy} width={cw} height={ch} fill={ACCENT_DARK} stroke={ACCENT_DARK} strokeWidth="1.5" opacity="0.9" />
      {/* L dimension */}
      <line x1={x0} y1={y0 - 25} x2={x0 + fw} y2={y0 - 25} stroke={INK} strokeWidth="0.8" />
      <line x1={x0} y1={y0 - 30} x2={x0} y2={y0 - 20} stroke={INK} strokeWidth="0.8" />
      <line x1={x0 + fw} y1={y0 - 30} x2={x0 + fw} y2={y0 - 20} stroke={INK} strokeWidth="0.8" />
      <text x={x0 + fw / 2} y={y0 - 32} textAnchor="middle" fontFamily="sans-serif" fontSize="13" fill={INK}>
        L = {i.L} m
      </text>
      {/* B dimension */}
      <line x1={x0 + fw + 25} y1={y0} x2={x0 + fw + 25} y2={y0 + fh} stroke={INK} strokeWidth="0.8" />
      <line x1={x0 + fw + 20} y1={y0} x2={x0 + fw + 30} y2={y0} stroke={INK} strokeWidth="0.8" />
      <line x1={x0 + fw + 20} y1={y0 + fh} x2={x0 + fw + 30} y2={y0 + fh} stroke={INK} strokeWidth="0.8" />
      <text x={x0 + fw + 35} y={y0 + fh / 2} fontFamily="sans-serif" fontSize="13" fill={INK}>
        B = {i.B} m
      </text>
      {/* Column callout */}
      <text x={cx + cw / 2} y={cy + ch / 2 + 4} textAnchor="middle" fontFamily="sans-serif" fontSize="10" fill="#fff" fontWeight="600">
        {i.c1}×{i.c2}
      </text>
      {/* Legend */}
      <text x={W / 2} y={y0 + fh + 28} textAnchor="middle" fontFamily="sans-serif" fontSize="11" fill={ACCENT}>
        {Nx} - φ{i.db}mm bars in X (top)
      </text>
      <text x={W / 2} y={y0 + fh + 44} textAnchor="middle" fontFamily="sans-serif" fontSize="11" fill="#c0392b">
        {Ny} - φ{i.db}mm bars in Y
      </text>
      <text x={W / 2} y={y0 + fh + 60} textAnchor="middle" fontFamily="sans-serif" fontSize="10" fill={MUTED}>
        Plan view (top) — {i.colPosition} column, h = {i.h_ftg} m thick
      </text>
    </svg>
  );
}

