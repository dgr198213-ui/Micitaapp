"use client";

import { useState, useTransition } from "react";
import { createTimeOffAction, deleteTimeOffAction } from "@/app/app/equipo/actions";
import type { ConflictingAppointment } from "@/modules/resources/service";

interface TimeOffRow {
  id: string;
  starts_at: string;
  ends_at: string;
  reason: string | null;
}

export function TimeOffManager({ staffId, initialRows }: { staffId: string; initialRows: TimeOffRow[] }) {
  const [rows, setRows] = useState(initialRows);
  const [conflicts, setConflicts] = useState<ConflictingAppointment[]>([]);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    const startsAt = new Date(String(formData.get("startsAt"))).toISOString();
    const endsAt = new Date(String(formData.get("endsAt"))).toISOString();
    const reason = String(formData.get("reason") || "");

    startTransition(async () => {
      const result = await createTimeOffAction(staffId, startsAt, endsAt, reason || undefined);
      setRows((prev) => [{ id: result.timeOff.id, starts_at: result.timeOff.starts_at, ends_at: result.timeOff.ends_at, reason: result.timeOff.reason }, ...prev]);
      setConflicts(result.conflicts);
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteTimeOffAction(id);
      setRows((prev) => prev.filter((r) => r.id !== id));
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <form action={handleSubmit} className="flex flex-wrap items-end gap-3 text-sm">
        <label className="flex flex-col gap-1">
          Desde
          <input name="startsAt" type="datetime-local" required className="rounded border px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1">
          Hasta
          <input name="endsAt" type="datetime-local" required className="rounded border px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1">
          Motivo (opcional)
          <input name="reason" className="rounded border px-2 py-1" />
        </label>
        <button type="submit" disabled={pending} className="rounded bg-gray-900 px-3 py-1.5 text-white disabled:opacity-50">
          Añadir ausencia
        </button>
      </form>

      {conflicts.length > 0 && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <p className="font-medium">Esta ausencia se solapa con {conflicts.length} cita(s) ya confirmadas:</p>
          <ul className="mt-1 list-disc pl-5">
            {conflicts.map((c) => (
              <li key={c.id}>
                {c.customerName} — {new Date(c.startsAt).toLocaleString("es-ES")}
              </li>
            ))}
          </ul>
          <p className="mt-1">No se han cancelado automáticamente. Contacta con estos clientes o cancela sus citas manualmente desde la agenda.</p>
        </div>
      )}

      <ul className="divide-y rounded border bg-white text-sm">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between px-3 py-2">
            <span>
              {new Date(r.starts_at).toLocaleString("es-ES")} – {new Date(r.ends_at).toLocaleString("es-ES")}
              {r.reason && <span className="text-gray-400"> · {r.reason}</span>}
            </span>
            <button type="button" onClick={() => handleDelete(r.id)} className="text-red-600 underline">
              Eliminar
            </button>
          </li>
        ))}
        {rows.length === 0 && <li className="px-3 py-4 text-center text-gray-400">Sin ausencias registradas.</li>}
      </ul>
    </div>
  );
}
