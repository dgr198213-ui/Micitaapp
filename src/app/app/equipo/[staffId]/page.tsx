import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getCurrentBusiness } from "@/modules/tenancy/service";
import { listTimeOff, listWorkingHours } from "@/modules/resources/service";
import { listServices, listStaffServiceIds } from "@/modules/catalog/service";
import { WorkingHoursEditor } from "./working-hours-editor";
import { TimeOffManager } from "./time-off-manager";
import { ServiceAssignment } from "./service-assignment";

export default async function StaffDetailPage({ params }: { params: Promise<{ staffId: string }> }) {
  const { staffId } = await params;
  const client = await createServerSupabaseClient();
  const business = await getCurrentBusiness(client);

  const [workingHours, timeOff, services, assignedServiceIds] = await Promise.all([
    listWorkingHours(client, staffId),
    listTimeOff(client, staffId),
    listServices(client, business.businessId, { includeInactive: true }),
    listStaffServiceIds(client, staffId),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-xl font-semibold">Horario y servicios</h1>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-3 font-medium">Servicios que realiza</h2>
        <ServiceAssignment staffId={staffId} services={services} assignedServiceIds={assignedServiceIds} />
      </section>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-3 font-medium">Horario semanal</h2>
        <WorkingHoursEditor staffId={staffId} initialRows={workingHours} />
      </section>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-3 font-medium">Ausencias / vacaciones</h2>
        <TimeOffManager staffId={staffId} initialRows={timeOff} />
      </section>
    </div>
  );
}
