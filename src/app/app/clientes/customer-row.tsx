"use client";

import { useState, useTransition } from "react";
import { anonymizeCustomerAction, updateCustomerNotesAction } from "./actions";

interface Customer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
}

export function CustomerRow({ customer }: { customer: Customer }) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [deleted, setDeleted] = useState(false);

  if (deleted) return null;

  return (
    <li className="px-4 py-3">
      <div className="flex items-center justify-between">
        <button type="button" onClick={() => setOpen((v) => !v)} className="text-left">
          <span className="font-medium">{customer.name}</span>
          <span className="ml-2 text-sm text-gray-400">{customer.email ?? customer.phone ?? ""}</span>
        </button>
        <button
          type="button"
          onClick={() =>
            startTransition(async () => {
              if (confirm("¿Anonimizar este cliente? Esta acción no se puede deshacer.")) {
                await anonymizeCustomerAction(customer.id);
                setDeleted(true);
              }
            })
          }
          disabled={pending}
          className="text-sm text-red-600 underline disabled:opacity-50"
        >
          Eliminar datos
        </button>
      </div>
      {open && (
        <form
          action={(formData) => startTransition(() => updateCustomerNotesAction(customer.id, formData))}
          className="mt-2 flex gap-2"
        >
          <textarea name="notes" defaultValue={customer.notes ?? ""} placeholder="Notas (sin datos de salud)" className="flex-1 rounded border px-2 py-1 text-sm" />
          <button type="submit" disabled={pending} className="h-fit rounded bg-gray-900 px-3 py-1.5 text-sm text-white disabled:opacity-50">
            Guardar
          </button>
        </form>
      )}
    </li>
  );
}
