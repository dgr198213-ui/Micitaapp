"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { cancelAppointmentAction, createManualBookingAction } from "./actions";

export interface AgendaAppointment {
  id: string;
  starts_at: string;
  ends_at: string;
  status: string;
  notes: string | null;
  staff_id: string;
  customers: { name: string; phone: string | null } | null;
  services: { name: string } | null;
  staff: { display_name: string } | null;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendiente",
  confirmed: "Confirmada",
  cancelled_by_client: "Cancelada (cliente)",
  cancelled_by_business: "Cancelada (negocio)",
  completed: "Completada",
  no_show: "No-show",
  expired: "Expirada",
};

export function AgendaClient({
  businessId,
  day,
  initialAppointments,
  services,
  staff,
}: {
  businessId: string;
  day: string;
  initialAppointments: AgendaAppointment[];
  services: { id: string; name: string }[];
  staff: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [pending, startTransition] = useTransition();
  const [formError, setFormError] = useState<string | null>(null);

  // Realtime (§6.2): if a client books while the owner is looking at the screen, the
  // appointment appears on its own — refresh pulls the joined view from the server.
  useEffect(() => {
    const client = createBrowserSupabaseClient();
    const channel = client
      .channel(`agenda-${businessId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments", filter: `business_id=eq.${businessId}` },
        () => router.refresh()
      )
      .subscribe();

    return () => {
      client.removeChannel(channel);
    };
  }, [businessId, router]);

  function changeDay(delta: number) {
    const next = new Date(day + "T00:00:00Z");
    next.setUTCDate(next.getUTCDate() + delta);
    router.push(`/app/agenda?date=${next.toISOString().slice(0, 10)}`);
  }

  function handleCancel(id: string) {
    if (!confirm("¿Cancelar esta cita?")) return;
    startTransition(async () => {
      await cancelAppointmentAction(id);
      router.refresh();
    });
  }

  function handleCreate(formData: FormData) {
    setFormError(null);
    startTransition(async () => {
      try {
        await createManualBookingAction(formData);
        setShowForm(false);
        router.refresh();
      } catch (err) {
        setFormError(err instanceof Error ? err.message : "No se pudo crear la cita.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => changeDay(-1)} className="rounded border px-2 py-1">
            ←
          </button>
          <h1 className="text-xl font-semibold">
            {new Date(day + "T00:00:00Z").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
          </h1>
          <button type="button" onClick={() => changeDay(1)} className="rounded border px-2 py-1">
            →
          </button>
        </div>
        <button type="button" onClick={() => setShowForm((v) => !v)} className="rounded bg-gray-900 px-3 py-2 text-sm text-white">
          {showForm ? "Cancelar" : "+ Cita manual"}
        </button>
      </div>

      {showForm && (
        <form action={handleCreate} className="grid grid-cols-2 gap-3 rounded-lg border bg-white p-4 sm:grid-cols-3">
          <select name="serviceId" required className="rounded border px-3 py-2">
            <option value="">Servicio…</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select name="staffId" required className="rounded border px-3 py-2">
            <option value="">Profesional…</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <input name="startsAt" type="datetime-local" required className="rounded border px-3 py-2" />
          <input name="customerName" required placeholder="Nombre del cliente" className="rounded border px-3 py-2" />
          <input name="customerPhone" placeholder="Teléfono" className="rounded border px-3 py-2" />
          <input name="customerEmail" type="email" placeholder="Email (opcional)" className="rounded border px-3 py-2" />
          <input name="notes" placeholder="Notas" className="col-span-2 rounded border px-3 py-2 sm:col-span-3" />
          {formError && <p className="col-span-full text-sm text-red-600">{formError}</p>}
          <button type="submit" disabled={pending} className="col-span-full w-fit rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50">
            {pending ? "Creando…" : "Crear cita"}
          </button>
        </form>
      )}

      <ul className="divide-y rounded-lg border bg-white">
        {initialAppointments.map((a) => (
          <li key={a.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <div>
              <span className="font-medium">
                {new Date(a.starts_at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}–
                {new Date(a.ends_at).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}
              </span>{" "}
              · {a.services?.name} · {a.staff?.display_name} · {a.customers?.name}
              <span className="ml-2 text-gray-400">{STATUS_LABEL[a.status] ?? a.status}</span>
            </div>
            {(a.status === "pending" || a.status === "confirmed") && (
              <button type="button" onClick={() => handleCancel(a.id)} className="text-red-600 underline">
                Cancelar
              </button>
            )}
          </li>
        ))}
        {initialAppointments.length === 0 && <li className="px-4 py-6 text-center text-gray-400">Sin citas este día.</li>}
      </ul>
    </div>
  );
}
