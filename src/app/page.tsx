import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="text-3xl font-semibold">Micitaapp</h1>
      <p className="text-gray-600">
        Agenda y reservas online para cualquier negocio de servicios con cita previa.
      </p>
      <div className="flex gap-4">
        <Link href="/login" className="rounded-md bg-gray-900 px-4 py-2 text-white hover:bg-gray-700">
          Acceso para negocios
        </Link>
        <Link href="/b/salon-maria" className="rounded-md border border-gray-300 px-4 py-2 hover:bg-gray-100">
          Ver ejemplo de reserva
        </Link>
      </div>
    </main>
  );
}
