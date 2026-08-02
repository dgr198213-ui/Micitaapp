"use client";

import { useState } from "react";
import type { AppointmentDetails } from "@/modules/scheduling/types";

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente de confirmación",
  confirmed: "Confirmada",
  cancelled_by_client: "Cancelada",
  cancelled_by_business: "Cancelada por el negocio",
  completed: "Completada",
  no_show: "No te presentaste",
  expired: "Expirada",
};

export function ManageAppointment({ token, appointment: initial }: { token: string; appointment: AppointmentDetails }) {
  const [appointment, setAppointment] = useState(initial);
  const [mode, setMode] = useState<"view" | "reschedule">("view");
  const [newDate, setNewDate] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canModify = appointment.status === "pending" || appointment.status === "confirmed";

  async function cancel() {
    if (!confirm("¿Seguro que quieres cancelar tu cita?")) return;
    setPending(true);
    setError(null);
    const res = await fetch(`/api/r/${token}/cancel`, { method: "POST" });
    const body = await res.json();
    setPending(false);
    if (!res.ok) {
      setError(body.message ?? "No se pudo cancelar.");
      return;
    }
    setAppointment((a) => ({ ...a, status: body.status }));
  }

  async function reschedule() {
    if (!newDate) return;
    setPending(true);
    setError(null);
    const res = await fetch(`/api/r/${token}/reschedule`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ startsAt: new Date(newDate).toISOString() }),
    });
    const body = await res.json();
    setPending(false);
    if (!res.ok) {
      setError(body.message ?? "No se pudo reprogramar.");
      return;
    }
    setAppointment((a) => ({ ...a, startsAt: body.startsAt, endsAt: body.endsAt, status: body.status }));
    setMode("view");
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{appointment.businessName}</h1>
      <div className="rounded-lg border bg-white p-4">
        <p className="font-medium">{appointment.serviceName}</p>
        <p className="text-sm text-gray-600">con {appointment.staffName}</p>
        <p className="mt-2">
          {new Date(appointment.startsAt).toLocaleString("es-ES", {
            dateStyle: "full",
            timeStyle: "short",
            timeZone: appointment.businessTimezone,
          })}{" "}
          <span className="text-xs text-gray-400">(hora del local)</span>
        </p>
        <p className="mt-1 text-sm text-gray-500">{STATUS_LABEL[appointment.status] ?? appointment.status}</p>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {canModify && mode === "view" && (
        <div className="flex gap-3">
          <button type="button" onClick={() => setMode("reschedule")} className="rounded border px-4 py-2 text-sm">
            Reprogramar
          </button>
          <button type="button" onClick={cancel} disabled={pending} className="rounded border border-red-300 px-4 py-2 text-sm text-red-700 disabled:opacity-50">
            Cancelar cita
          </button>
        </div>
      )}

      {canModify && mode === "reschedule" && (
        <div className="flex flex-col gap-3">
          <input type="datetime-local" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="rounded border px-3 py-2" />
          <div className="flex gap-3">
            <button type="button" onClick={reschedule} disabled={pending || !newDate} className="rounded bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-50">
              Confirmar nueva hora
            </button>
            <button type="button" onClick={() => setMode("view")} className="rounded border px-4 py-2 text-sm">
              Cancelar cambio
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
