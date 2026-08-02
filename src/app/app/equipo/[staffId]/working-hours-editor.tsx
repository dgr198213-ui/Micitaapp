"use client";

import { useState, useTransition } from "react";
import { setWorkingHoursAction } from "@/app/app/equipo/actions";
import type { WorkingHoursInput } from "@/modules/resources/service";

const WEEKDAY_LABELS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

interface Row {
  weekday: number;
  startLocal: string;
  endLocal: string;
}

function toRow(r: { weekday: number; start_local: string; end_local: string }): Row {
  return { weekday: r.weekday, startLocal: r.start_local.slice(0, 5), endLocal: r.end_local.slice(0, 5) };
}

export function WorkingHoursEditor({ staffId, initialRows }: { staffId: string; initialRows: { weekday: number; start_local: string; end_local: string }[] }) {
  const [rows, setRows] = useState<Row[]>(initialRows.map(toRow));
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function addWindow(weekday: number) {
    setRows((prev) => [...prev, { weekday, startLocal: "09:00", endLocal: "13:00" }]);
    setSaved(false);
  }

  function removeWindow(index: number) {
    setRows((prev) => prev.filter((_, i) => i !== index));
    setSaved(false);
  }

  function updateWindow(index: number, field: "startLocal" | "endLocal", value: string) {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
    setSaved(false);
  }

  function save() {
    const input: WorkingHoursInput[] = rows.filter((r) => r.startLocal && r.endLocal && r.startLocal < r.endLocal);
    startTransition(async () => {
      await setWorkingHoursAction(staffId, input);
      setSaved(true);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {WEEKDAY_LABELS.map((label, weekday) => (
        <div key={weekday} className="flex flex-wrap items-center gap-2 border-b pb-2 text-sm last:border-0">
          <span className="w-24 shrink-0 font-medium">{label}</span>
          {rows
            .map((r, i) => ({ ...r, i }))
            .filter((r) => r.weekday === weekday)
            .map((r) => (
              <span key={r.i} className="flex items-center gap-1">
                <input
                  type="time"
                  value={r.startLocal}
                  onChange={(e) => updateWindow(r.i, "startLocal", e.target.value)}
                  className="rounded border px-2 py-1"
                />
                <span>–</span>
                <input
                  type="time"
                  value={r.endLocal}
                  onChange={(e) => updateWindow(r.i, "endLocal", e.target.value)}
                  className="rounded border px-2 py-1"
                />
                <button type="button" onClick={() => removeWindow(r.i)} className="text-red-600" aria-label="Eliminar turno">
                  ×
                </button>
              </span>
            ))}
          <button type="button" onClick={() => addWindow(weekday)} className="text-gray-500 underline">
            + turno
          </button>
        </div>
      ))}
      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={pending} className="w-fit rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50">
          {pending ? "Guardando…" : "Guardar horario"}
        </button>
        {saved && <span className="text-sm text-green-700">Guardado.</span>}
      </div>
    </div>
  );
}
