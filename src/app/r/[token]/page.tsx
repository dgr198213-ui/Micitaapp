import { notFound } from "next/navigation";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import { getAppointmentByToken } from "@/modules/scheduling/service";
import { ManageAppointment } from "./manage-appointment";

export default async function ManageAppointmentPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const client = createPublicSupabaseClient();

  try {
    const appointment = await getAppointmentByToken(client, token);
    return (
      <main className="mx-auto max-w-lg px-4 py-8">
        <ManageAppointment token={token} appointment={appointment} />
      </main>
    );
  } catch {
    notFound();
  }
}
