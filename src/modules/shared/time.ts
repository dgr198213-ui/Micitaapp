// Client- and server-safe formatting for "hora del local" (§6.2): the customer's device
// timezone must never silently substitute for the business's, since that's the most
// expensive bug in this domain (RN-06).

export function formatInBusinessTimezone(isoInstant: string, timezone: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(isoInstant));
}

export function formatDateInBusinessTimezone(isoInstant: string, timezone: string): string {
  return new Intl.DateTimeFormat("es-ES", {
    timeZone: timezone,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(isoInstant));
}

export function isDeviceTimezoneDifferent(timezone: string): boolean {
  return Intl.DateTimeFormat().resolvedOptions().timeZone !== timezone;
}
