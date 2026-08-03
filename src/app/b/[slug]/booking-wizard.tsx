"use client";

import { useEffect, useState } from "react";
import type { StorefrontService as Service, StorefrontStaff as Staff } from "@/modules/scheduling/storefront";

interface Slot {
  staffId: string;
  startsAt: string;
  endsAt: string;
}

type Step = "service" | "slot" | "contact" | "done";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function BookingWizard({
  slug,
  timezone,
  services,
  staff,
}: {
  slug: string;
  timezone: string;
  services: Service[];
  staff: Staff[];
}) {
  const [step, setStep] = useState<Step>("service");
  const [service, setService] = useState<Service | null>(null);
  const [staffId, setStaffId] = useState<string>("");
  const [date, setDate] = useState(todayIso());
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [marketing, setMarketing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [alternatives, setAlternatives] = useState<Slot[]>([]);
  const [confirmation, setConfirmation] = useState<{ manageUrl: string | null; startsAt: string } | null>(null);
  // One key per visit to the contact step (§7.4): stable across a double-click or a
  // network retry of the same submission, but fresh if the user goes back and picks a
  // different slot — that's a genuinely different booking attempt.
  const [idempotencyKey, setIdempotencyKey] = useState("");
  useEffect(() => {
    if (step === "contact") setIdempotencyKey(crypto.randomUUID());
  }, [step]);

  const deviceTimezone = typeof window !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : timezone;

  async function loadSlots(forDate: string, forStaffId: string) {
    if (!service) return;
    setLoadingSlots(true);
    setSlots([]);
    const to = new Date(forDate + "T00:00:00Z");
    to.setUTCDate(to.getUTCDate() + 7);
    const params = new URLSearchParams({ service: service.id, from: forDate, to: to.toISOString().slice(0, 10) });
    if (forStaffId) params.set("staff", forStaffId);
    try {
      const res = await fetch(`/api/b/${slug}/availability?${params.toString()}`);
      const body = await res.json();
      setSlots(body.slots ?? []);
    } finally {
      setLoadingSlots(false);
    }
  }

  function selectService(s: Service) {
    setService(s);
    setStep("slot");
    loadSlots(date, staffId);
  }

  async function submitBooking() {
    if (!service || !selectedSlot) return;
    if (!email && !phone) {
      setError("Necesitamos un email o un teléfono de contacto.");
      return;
    }
    setSubmitting(true);
    setError(null);
    setAlternatives([]);
    try {
      const res = await fetch(`/api/b/${slug}/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": idempotencyKey },
        body: JSON.stringify({
          serviceId: service.id,
          staffId: selectedSlot.staffId,
          startsAt: selectedSlot.startsAt,
          customer: { name, email: email || undefined, phone: phone || undefined },
          consent: { terms: true, marketing },
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body.message ?? "No se pudo completar la reserva.");
        setAlternatives(body.details?.alternatives ?? []);
        return;
      }
      setConfirmation({ manageUrl: body.manageUrl ?? null, startsAt: body.startsAt });
      setStep("done");
    } catch {
      setError("No se pudo conectar. Inténtalo de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <ol className="flex gap-2 text-xs text-gray-400">
        <li className={step === "service" ? "font-semibold text-gray-900" : ""}>1. Servicio</li>
        <li>·</li>
        <li className={step === "slot" ? "font-semibold text-gray-900" : ""}>2. Fecha y hora</li>
        <li>·</li>
        <li className={step === "contact" ? "font-semibold text-gray-900" : ""}>3. Tus datos</li>
      </ol>

      {step === "service" && (
        <div className="flex flex-col gap-2">
          {services.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => selectService(s)}
              className="flex items-center justify-between rounded-lg border bg-white px-4 py-3 text-left hover:border-gray-900"
            >
              <span>
                <span className="font-medium">{s.name}</span>
                <span className="ml-2 text-sm text-gray-400">{s.durationMinutes} min</span>
              </span>
              <span className="font-medium">{(s.priceCents / 100).toFixed(2)} €</span>
            </button>
          ))}
          {services.length === 0 && <p className="text-gray-400">Este negocio no tiene servicios disponibles ahora mismo.</p>}
        </div>
      )}

      {step === "slot" && service && (
        <div className="flex flex-col gap-4">
          <button type="button" onClick={() => setStep("service")} className="w-fit text-sm text-gray-500 underline">
            ← Cambiar servicio
          </button>

          {staff.length > 1 && (
            <select
              value={staffId}
              onChange={(e) => {
                setStaffId(e.target.value);
                loadSlots(date, e.target.value);
              }}
              className="rounded border px-3 py-2"
            >
              <option value="">Cualquier profesional disponible</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName}
                </option>
              ))}
            </select>
          )}

          <input
            type="date"
            value={date}
            min={todayIso()}
            onChange={(e) => {
              setDate(e.target.value);
              loadSlots(e.target.value, staffId);
            }}
            className="rounded border px-3 py-2"
          />

          {deviceTimezone !== timezone && (
            <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Las horas se muestran en la zona horaria del negocio ({timezone}), no en la tuya.
            </p>
          )}

          {loadingSlots && <p className="text-sm text-gray-400">Buscando huecos…</p>}
          {!loadingSlots && slots.length === 0 && <p className="text-sm text-gray-400">Sin huecos disponibles en los próximos días.</p>}

          <div className="grid grid-cols-4 gap-2">
            {slots.map((slot) => (
              <button
                key={`${slot.staffId}-${slot.startsAt}`}
                type="button"
                onClick={() => {
                  setSelectedSlot(slot);
                  setStep("contact");
                }}
                className="rounded border px-2 py-2 text-sm hover:border-gray-900"
              >
                {new Date(slot.startsAt).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit", timeZone: timezone })}
              </button>
            ))}
          </div>
        </div>
      )}

      {step === "contact" && service && selectedSlot && (
        <div className="flex flex-col gap-3">
          <button type="button" onClick={() => setStep("slot")} className="w-fit text-sm text-gray-500 underline">
            ← Cambiar hora
          </button>
          <p className="text-sm text-gray-600">
            {service.name} ·{" "}
            {new Date(selectedSlot.startsAt).toLocaleString("es-ES", {
              weekday: "long",
              day: "numeric",
              month: "long",
              hour: "2-digit",
              minute: "2-digit",
              timeZone: timezone,
            })}{" "}
            (hora del local)
          </p>

          <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Nombre" className="rounded border px-3 py-2" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email" className="rounded border px-3 py-2" />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Teléfono" className="rounded border px-3 py-2" />
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input type="checkbox" checked={marketing} onChange={(e) => setMarketing(e.target.checked)} />
            Quiero recibir novedades y promociones
          </label>

          {error && (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <p>{error}</p>
              {alternatives.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {alternatives.map((alt) => (
                    <button
                      key={alt.startsAt}
                      type="button"
                      onClick={() => {
                        setSelectedSlot(alt);
                        setError(null);
                        setAlternatives([]);
                      }}
                      className="rounded border border-red-300 bg-white px-2 py-1 text-xs"
                    >
                      {new Date(alt.startsAt).toLocaleString("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: timezone })}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            disabled={submitting || !name}
            onClick={submitBooking}
            className="rounded bg-gray-900 px-4 py-2 text-white disabled:opacity-50"
          >
            {submitting ? "Reservando…" : "Confirmar reserva"}
          </button>
        </div>
      )}

      {step === "done" && confirmation && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="font-medium text-green-800">¡Reserva confirmada!</p>
          <p className="mt-1 text-sm text-green-700">
            {new Date(confirmation.startsAt).toLocaleString("es-ES", { dateStyle: "full", timeStyle: "short", timeZone: timezone })} (hora del local)
          </p>
          {confirmation.manageUrl ? (
            <a href={confirmation.manageUrl} className="mt-3 inline-block text-sm text-green-800 underline">
              Gestionar mi cita (cancelar o reprogramar)
            </a>
          ) : (
            <p className="mt-3 text-sm text-green-800">
              Te hemos enviado un email con el enlace para gestionar tu cita.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
