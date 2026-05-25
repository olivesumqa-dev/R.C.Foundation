import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { FolderOpen, Save, Trash2, X } from "lucide-react";
import type { FootingInputs } from "@/lib/calc-engine/rc-footing";

const STORAGE_KEY = "structl:standalone-calculations";

export interface StoredCalculation {
  id: number;
  calcType: string;
  name: string;
  folder: string;
  data: FootingInputs;
  createdAt: string;
  updatedAt: string;
}

function readAll(): StoredCalculation[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(records: StoredCalculation[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export function readCalculations(calcType: string): StoredCalculation[] {
  return readAll()
    .filter((item) => item.calcType === calcType)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function writeCalculations(calcType: string, records: StoredCalculation[]) {
  const otherRecords = readAll().filter((item) => item.calcType !== calcType);
  writeAll([...records, ...otherRecords]);
}

interface SaveDialogProps {
  mode: "save" | "saveas";
  currentName: string;
  currentFolder: string;
  onSave: (name: string, folder: string) => Promise<void>;
  onClose: () => void;
}

export function SaveDialog({ mode, currentName, currentFolder, onSave, onClose }: SaveDialogProps) {
  const [name, setName] = useState(currentName || "Footing F-1");
  const [folder, setFolder] = useState(currentFolder || "Projects");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Enter a calculation name.");
      return;
    }
    setSaving(true);
    try {
      await onSave(name.trim(), folder.trim());
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogShell title={mode === "save" ? "Save Calculation" : "Save As"} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4">
        {error && <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>}
        <label className="block text-xs font-semibold uppercase tracking-widest text-slate-600">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-950 outline-none focus:ring-2 focus:ring-blue-500" />
        </label>
        <label className="block text-xs font-semibold uppercase tracking-widest text-slate-600">
          Folder
          <input value={folder} onChange={(e) => setFolder(e.target.value)} className="mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm font-normal normal-case tracking-normal text-slate-950 outline-none focus:ring-2 focus:ring-blue-500" />
        </label>
        <button type="submit" disabled={saving} className="inline-flex w-full items-center justify-center gap-2 rounded bg-[#0c2d57] px-4 py-2.5 text-xs font-semibold uppercase tracking-widest text-white transition hover:opacity-90 disabled:opacity-50">
          <Save className="h-4 w-4" />
          {saving ? "Saving" : "Save"}
        </button>
      </form>
    </DialogShell>
  );
}

interface LoadDialogProps {
  calcType: string;
  onLoad: (id: number) => Promise<void>;
  onClose: () => void;
}

export function LoadDialog({ calcType, onLoad, onClose }: LoadDialogProps) {
  const [records, setRecords] = useState(() => readCalculations(calcType));
  const grouped = useMemo(() => {
    return records.reduce<Record<string, StoredCalculation[]>>((acc, record) => {
      const folder = record.folder || "Projects";
      acc[folder] = acc[folder] ?? [];
      acc[folder].push(record);
      return acc;
    }, {});
  }, [records]);

  const remove = (id: number) => {
    const next = records.filter((record) => record.id !== id);
    writeCalculations(calcType, next);
    setRecords(next);
  };

  return (
    <DialogShell title="Load Calculation" onClose={onClose}>
      {records.length === 0 ? (
        <div className="rounded border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
          No saved calculations yet.
        </div>
      ) : (
        <div className="max-h-[52vh] space-y-5 overflow-y-auto pr-1">
          {Object.entries(grouped).map(([folder, items]) => (
            <section key={folder}>
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-slate-500">
                <FolderOpen className="h-3.5 w-3.5" />
                {folder}
              </div>
              <div className="space-y-2">
                {items.map((record) => (
                  <div key={record.id} className="flex items-center gap-2 rounded border border-slate-200 bg-white p-3">
                    <button onClick={async () => { await onLoad(record.id); onClose(); }} className="min-w-0 flex-1 text-left">
                      <div className="truncate text-sm font-semibold text-slate-950">{record.name}</div>
                      <div className="text-xs text-slate-500">Updated {new Date(record.updatedAt).toLocaleString()}</div>
                    </button>
                    <button onClick={() => remove(record.id)} className="rounded p-2 text-slate-400 transition hover:bg-red-50 hover:text-red-700" title="Delete saved calculation">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </DialogShell>
  );
}

function DialogShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[150] flex items-center justify-center bg-black/55 p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.96, y: 8 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.96, y: 8 }} className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-4 border-b border-slate-200 pb-3">
          <h2 className="font-serif text-xl text-slate-950">{title}</h2>
          <button onClick={onClose} className="rounded p-1.5 text-slate-500 transition hover:bg-slate-100 hover:text-slate-950" title="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}
