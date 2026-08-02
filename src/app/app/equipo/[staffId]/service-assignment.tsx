"use client";

import { useState, useTransition } from "react";
import { setStaffServicesAction } from "@/app/app/servicios/actions";

interface ServiceOption {
  id: string;
  name: string;
}

export function ServiceAssignment({
  staffId,
  services,
  assignedServiceIds,
}: {
  staffId: string;
  services: ServiceOption[];
  assignedServiceIds: string[];
}) {
  const [selected, setSelected] = useState(new Set(assignedServiceIds));
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  function toggle(serviceId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(serviceId)) next.delete(serviceId);
      else next.add(serviceId);
      return next;
    });
    setSaved(false);
  }

  function save() {
    startTransition(async () => {
      await setStaffServicesAction(staffId, Array.from(selected));
      setSaved(true);
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-3">
        {services.map((s) => (
          <label key={s.id} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} />
            {s.name}
          </label>
        ))}
        {services.length === 0 && <p className="text-sm text-gray-400">Crea primero algún servicio.</p>}
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="w-fit rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50"
        >
          {pending ? "Guardando…" : "Guardar"}
        </button>
        {saved && <span className="text-sm text-green-700">Guardado.</span>}
      </div>
    </div>
  );
}
