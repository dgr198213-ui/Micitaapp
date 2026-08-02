export interface AppointmentEmailContext {
  businessName: string;
  serviceName: string;
  staffName: string;
  customerName: string;
  startsAtLocal: string; // already formatted in the business timezone
  manageUrl: string;
}

export function confirmationEmail(ctx: AppointmentEmailContext) {
  return {
    subject: `Reserva confirmada en ${ctx.businessName}`,
    html: `
      <p>Hola ${ctx.customerName},</p>
      <p>Tu cita para <strong>${ctx.serviceName}</strong> con ${ctx.staffName} en <strong>${ctx.businessName}</strong> está confirmada para el <strong>${ctx.startsAtLocal}</strong> (hora del local).</p>
      <p><a href="${ctx.manageUrl}">Gestionar mi cita</a> (cancelar o reprogramar)</p>
    `,
  };
}

export function reminderEmail(ctx: AppointmentEmailContext) {
  return {
    subject: `Recordatorio: mañana tienes cita en ${ctx.businessName}`,
    html: `
      <p>Hola ${ctx.customerName},</p>
      <p>Te recordamos tu cita de <strong>${ctx.serviceName}</strong> con ${ctx.staffName} el <strong>${ctx.startsAtLocal}</strong> (hora del local).</p>
      <p><a href="${ctx.manageUrl}">Gestionar mi cita</a></p>
    `,
  };
}

export function cancellationEmail(ctx: AppointmentEmailContext) {
  return {
    subject: `Cita cancelada en ${ctx.businessName}`,
    html: `
      <p>Hola ${ctx.customerName},</p>
      <p>Tu cita de <strong>${ctx.serviceName}</strong> del <strong>${ctx.startsAtLocal}</strong> ha sido cancelada.</p>
    `,
  };
}
