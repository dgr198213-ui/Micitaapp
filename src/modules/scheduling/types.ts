export interface Slot {
  staffId: string;
  startsAt: string;
  endsAt: string;
}

export interface AvailabilityQuery {
  businessSlug: string;
  serviceId: string;
  staffId?: string | null;
  from: string; // ISO date, YYYY-MM-DD
  to: string; // ISO date, YYYY-MM-DD
}

export interface CreateBookingInput {
  businessSlug: string;
  serviceId: string;
  staffId?: string | null;
  startsAt: string; // ISO instant, UTC
  customer: { name: string; email?: string | null; phone?: string | null };
  notes?: string | null;
  consent?: { terms: boolean; marketing?: boolean };
  idempotencyKey?: string | null;
}

export interface BookingResult {
  id: string;
  status: string;
  startsAt: string;
  endsAt: string;
  manageToken: string;
  priceCents: number;
}

export interface AppointmentDetails {
  id: string;
  status: string;
  startsAt: string;
  endsAt: string;
  serviceName: string;
  staffName: string;
  businessName: string;
  businessTimezone: string;
  priceCents: number;
}
