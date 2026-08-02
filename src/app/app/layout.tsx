import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/modules/tenancy/service";
import { signOutAction } from "@/app/login/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const client = await createServerSupabaseClient();
  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const business = await getCurrentBusiness(client).catch(() => null);
  if (!business) {
    redirect("/login?error=no_business");
  }

  const nav = [
    { href: "/app/agenda", label: "Agenda" },
    { href: "/app/servicios", label: "Servicios" },
    { href: "/app/equipo", label: "Equipo" },
    { href: "/app/clientes", label: "Clientes" },
  ];

  return (
    <div className="min-h-screen">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <span className="font-semibold">{business.businessName}</span>
            <nav className="flex gap-4 text-sm">
              {nav.map((item) => (
                <Link key={item.href} href={item.href} className="text-gray-600 hover:text-gray-900">
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <form action={signOutAction}>
            <button type="submit" className="text-sm text-gray-500 hover:text-gray-900">
              Cerrar sesión
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
