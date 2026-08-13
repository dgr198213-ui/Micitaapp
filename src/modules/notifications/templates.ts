export interface AppointmentEmailContext {
  businessName: string;
  serviceName: string;
  staffName: string;
  customerName: string;
  startsAtLocal: string; // already formatted in the business timezone
  manageUrl: string;
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>'\"]/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "'":
        return "&#39;";
      case '\"':
        return "&quot;";
      default:
        return character;
    }
  });
}

function safeContext(ctx: AppointmentEmailContext) {
  return {
    businessName: escapeHtml(ctx.businessName),
    serviceName: escapeHtml(ctx.serviceName),
    staffName: escapeHtml(ctx.staffName),
    customerName: escapeHtml(ctx.customerName),
    startsAtLocal: escapeHtml(ctx.startsAtLocal),
    manageUrl: escapeHtml(ctx.manageUrl),
  };
}

export function confirmationEmail(ctx: AppointmentEmailContext) {
  const safe = safeContext(ctx);
  return {
    subject: `Reserva confirmada en ${ctx.businessName}`,
    html: `
      <p>Hola ${safe.customerName},</p>
      <p>Tu cita para <strong>${safe.serviceName}</strong> con ${safe.staffName} en <strong>${safe.businessName}</strong> está confirmada para el <strong>${safe.startsAtLocal}</strong> (hora del local).</p>
      <p><a href="${safe.manageUrl}">Gestionar mi cita</a> (cancelar o reprogramar)</p>
    `,
  };
}

export function reminderEmail(ctx: AppointmentEmailContext) {
  const safe = safeContext(ctx);
  return {
    subject: `Recordatorio: mañana tienes cita en ${ctx.businessName}`,
    html: `
      <p>Hola ${safe.customerName},</p>
      <p>Te recordamos tu cita de <strong>${safe.serviceName}</strong> con ${safe.staffName} el <strong>${safe.startsAtLocal}</strong> (hora del local).</p>
      <p><a href="${safe.manageUrl}">Gestionar mi cita</a></p>
    `,
  };
}

export function cancellationEmail(ctx: AppointmentEmailContext) {
  const safe = safeContext(ctx);
  return {
    subject: `Cita cancelada en ${ctx.businessName}`,
    html: `
      <p>Hola ${safe.customerName},</p>
      <p>Tu cita de <strong>${safe.serviceName}</strong> del <strong>${safe.startsAtLocal}</strong> ha sido cancelada.</p>
    `,
  };
}
