import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/modules/tenancy/service";
import { listServices } from "@/modules/catalog/service";
import { createServiceAction, setServiceActiveAction } from "./actions";
import { ToggleButton } from "./toggle-button";

export default async function ServiciosPage() {
  const client = await createServerSupabaseClient();
  const business = await getCurrentBusiness(client);
  const services = await listServices(client, business.businessId, { includeInactive: true });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">Servicios</h1>
        <p className="text-sm text-gray-600">Catálogo de servicios: duración, buffer de limpieza y precio.</p>
      </div>

      <form action={createServiceAction} className="grid grid-cols-2 gap-3 rounded-lg border bg-white p-4 sm:grid-cols-5">
        <input name="name" required placeholder="Nombre" className="col-span-2 rounded border px-3 py-2 sm:col-span-1" />
        <input name="durationMinutes" required type="number" min={5} placeholder="Duración (min)" className="rounded border px-3 py-2" />
        <input name="bufferAfterMinutes" type="number" min={0} placeholder="Buffer (min)" className="rounded border px-3 py-2" />
        <input name="priceCents" type="number" min={0} placeholder="Precio (céntimos)" className="rounded border px-3 py-2" />
        <button type="submit" className="rounded bg-gray-900 px-3 py-2 text-white">
          Añadir
        </button>
      </form>

      <table className="w-full overflow-hidden rounded-lg border bg-white text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
          <tr>
            <th className="px-4 py-2">Nombre</th>
            <th className="px-4 py-2">Duración</th>
            <th className="px-4 py-2">Buffer</th>
            <th className="px-4 py-2">Precio</th>
            <th className="px-4 py-2">Estado</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody>
          {services.map((s) => (
            <tr key={s.id} className="border-t">
              <td className="px-4 py-2">{s.name}</td>
              <td className="px-4 py-2">{s.duration_minutes} min</td>
              <td className="px-4 py-2">{s.buffer_after_minutes} min</td>
              <td className="px-4 py-2">{(s.price_cents / 100).toFixed(2)} €</td>
              <td className="px-4 py-2">{s.active ? "Activo" : "Inactivo"}</td>
              <td className="px-4 py-2">
                <ToggleButton serviceId={s.id} active={s.active} action={setServiceActiveAction} />
              </td>
            </tr>
          ))}
          {services.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-6 text-center text-gray-400">
                Todavía no hay servicios.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
