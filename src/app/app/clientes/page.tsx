import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/modules/tenancy/service";
import { listCustomers } from "@/modules/crm/service";
import { CustomerRow } from "./customer-row";

export default async function ClientesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const client = await createServerSupabaseClient();
  const business = await getCurrentBusiness(client);
  const customers = await listCustomers(client, business.businessId, q);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold">Clientes</h1>
        <p className="text-sm text-gray-600">Ficha básica e historial. Sin datos de salud (§8.8).</p>
      </div>

      <form className="flex gap-2">
        <input name="q" defaultValue={q} placeholder="Buscar por nombre, email o teléfono" className="flex-1 rounded border px-3 py-2 text-sm" />
        <button type="submit" className="rounded bg-gray-900 px-3 py-2 text-sm text-white">
          Buscar
        </button>
      </form>

      <ul className="divide-y rounded-lg border bg-white">
        {customers.map((c) => (
          <CustomerRow key={c.id} customer={c} />
        ))}
        {customers.length === 0 && <li className="px-4 py-6 text-center text-gray-400">Sin resultados.</li>}
      </ul>
    </div>
  );
}
