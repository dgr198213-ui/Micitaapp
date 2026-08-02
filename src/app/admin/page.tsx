import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function AdminPage() {
  const client = await createServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) redirect("/login");

  const { data: isAdmin } = await client.rpc("auth_is_platform_admin");
  if (!isAdmin) redirect("/app/agenda");

  const { data: businesses } = await client
    .from("businesses")
    .select("id, slug, name, timezone, active, created_at")
    .order("created_at", { ascending: false });

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <h1 className="mb-6 text-xl font-semibold">Panel de plataforma</h1>
      <table className="w-full rounded-lg border bg-white text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
          <tr>
            <th className="px-4 py-2">Negocio</th>
            <th className="px-4 py-2">Slug</th>
            <th className="px-4 py-2">Zona horaria</th>
            <th className="px-4 py-2">Estado</th>
            <th className="px-4 py-2">Alta</th>
          </tr>
        </thead>
        <tbody>
          {(businesses ?? []).map((b) => (
            <tr key={b.id} className="border-t">
              <td className="px-4 py-2">{b.name}</td>
              <td className="px-4 py-2">{b.slug}</td>
              <td className="px-4 py-2">{b.timezone}</td>
              <td className="px-4 py-2">{b.active ? "Activo" : "Inactivo"}</td>
              <td className="px-4 py-2">{new Date(b.created_at).toLocaleDateString("es-ES")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
