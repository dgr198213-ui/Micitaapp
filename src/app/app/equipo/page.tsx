import Link from "next/link";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/modules/tenancy/service";
import { listStaff } from "@/modules/resources/service";
import { createStaffAction, setStaffActiveAction } from "./actions";
import { ToggleButton } from "@/app/app/servicios/toggle-button";

export default async function EquipoPage() {
  const client = await createServerSupabaseClient();
  const business = await getCurrentBusiness(client);
  const staff = await listStaff(client, business.businessId, { includeInactive: true });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-xl font-semibold">Equipo</h1>
        <p className="text-sm text-gray-600">Personal, horarios laborales y ausencias.</p>
      </div>

      <form action={createStaffAction} className="flex gap-3 rounded-lg border bg-white p-4">
        <input name="displayName" required placeholder="Nombre del profesional" className="flex-1 rounded border px-3 py-2" />
        <button type="submit" className="rounded bg-gray-900 px-3 py-2 text-white">
          Añadir
        </button>
      </form>

      <ul className="divide-y rounded-lg border bg-white">
        {staff.map((s) => (
          <li key={s.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <Link href={`/app/equipo/${s.id}`} className="font-medium hover:underline">
                {s.display_name}
              </Link>
              <span className="ml-2 text-xs text-gray-400">{s.active ? "Activo" : "Inactivo"}</span>
            </div>
            <ToggleButton serviceId={s.id} active={s.active} action={setStaffActiveAction} />
          </li>
        ))}
        {staff.length === 0 && <li className="px-4 py-6 text-center text-gray-400">Todavía no hay personal.</li>}
      </ul>
    </div>
  );
}
