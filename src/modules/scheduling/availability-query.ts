import { z } from "zod";

// V-10: the availability engine is O(staff x days x slots) with two EXISTS per candidate
// slot. An unbounded window on a public, unauthenticated endpoint is a CPU-exhaustion
// primitive, so the range is capped here (31 days) as well as in the SQL function (62).
// Extracted from the route handler so it can be unit-tested without spinning up Next.
export const MAX_RANGE_DAYS = 31;

export const availabilityQuerySchema = z
  .object({
    service: z.string().uuid(),
    staff: z.string().uuid().optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .refine(
    (q) => {
      const span = (Date.parse(`${q.to}T00:00:00Z`) - Date.parse(`${q.from}T00:00:00Z`)) / 86_400_000;
      return Number.isFinite(span) && span >= 0 && span <= MAX_RANGE_DAYS;
    },
    { message: `El rango no puede superar ${MAX_RANGE_DAYS} días`, path: ["to"] }
  );
