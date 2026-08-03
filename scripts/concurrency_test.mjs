#!/usr/bin/env node
// T-E: the requirement the architecture doc itself calls "the requirement of the product"
// (§16.2). The exclusion constraint is proven deterministically by pgTAP
// (supabase/tests/03_no_overlap_constraint.sql), but that never opens 50 real, independent
// connections at once — a connection pool that serializes queries would make the race
// impossible to lose and the test worthless, so this script opens CONCURRENCY separate
// `pg` Client connections (not a Pool) and fires them with Promise.all.
import { Client } from "pg";

// DEV/CI-ONLY default: matches the local Postgres install set up by
// scripts/reset_local_test_db.sh (see that script's header for why this environment uses a
// native install instead of `supabase start`). Override with DATABASE_URL against any real
// Postgres — the SQL functions this hits are identical to what a Supabase project runs.
const CONNECTION_STRING = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/micitaapp_test";
const CONCURRENCY = 50;

const BUSINESS_ID = "10000000-0000-0000-0000-000000000001";
const BUSINESS_SLUG = "barberia-lujan";
const SERVICE_ID = "10000000-0000-0000-0000-000000000201";
const STAFF_ID = "10000000-0000-0000-0000-000000000101";

async function withClient(fn) {
  const client = new Client({ connectionString: CONNECTION_STRING });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

async function findFreeSlot() {
  return withClient(async (client) => {
    const { rows } = await client.query(
      `select starts_at from get_available_slots($1, $2, $3, current_date + 7, current_date + 20) limit 1`,
      [BUSINESS_ID, SERVICE_ID, STAFF_ID]
    );
    if (rows.length === 0) {
      throw new Error("No free slot found — check that supabase/seed.sql is loaded and the barbería's working hours are intact.");
    }
    return rows[0].starts_at;
  });
}

async function attemptBooking(startsAt, index) {
  return withClient(async (client) => {
    try {
      const { rows } = await client.query(
        `select * from create_public_booking($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          BUSINESS_SLUG,
          SERVICE_ID,
          STAFF_ID,
          startsAt,
          `Concurrency Test ${index}`,
          `concurrency-test-${index}-${Date.now()}@example.com`,
          null,
          null,
          false,
          null, // no idempotency key: every connection races the exclusion constraint directly
          null,
        ]
      );
      return { ok: true, appointmentId: rows[0]?.appointment_id };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });
}

async function countBookedRows(startsAt) {
  return withClient(async (client) => {
    const { rows } = await client.query(
      `select count(*)::int as count from appointments
       where staff_id = $1 and starts_at = $2 and status in ('pending', 'confirmed')`,
      [STAFF_ID, startsAt]
    );
    return rows[0].count;
  });
}

async function main() {
  console.log(`Finding a free slot for ${BUSINESS_SLUG} (staff ${STAFF_ID}, service ${SERVICE_ID})...`);
  const startsAt = await findFreeSlot();
  console.log(`Racing ${CONCURRENCY} independent connections for ${startsAt.toISOString()}...`);

  const results = await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => attemptBooking(startsAt, i)));

  const successes = results.filter((r) => r.ok);
  const slotTaken = results.filter((r) => !r.ok && r.error?.includes("SLOT_TAKEN"));
  const unexpected = results.filter((r) => !r.ok && !r.error?.includes("SLOT_TAKEN"));
  const rowCount = await countBookedRows(startsAt);

  console.log(`Successes:            ${successes.length}`);
  console.log(`SLOT_TAKEN rejections: ${slotTaken.length}`);
  console.log(`Unexpected errors:     ${unexpected.length}`);
  console.log(`Rows in appointments:  ${rowCount}`);
  if (unexpected.length > 0) {
    console.log("Unexpected error messages:", unexpected.map((r) => r.error));
  }

  const failures = [];
  if (successes.length !== 1) failures.push(`expected exactly 1 success, got ${successes.length}`);
  if (slotTaken.length !== CONCURRENCY - 1) failures.push(`expected exactly ${CONCURRENCY - 1} SLOT_TAKEN, got ${slotTaken.length}`);
  if (unexpected.length !== 0) failures.push(`expected 0 unexpected errors, got ${unexpected.length}`);
  if (rowCount !== 1) failures.push(`expected exactly 1 row in appointments for this slot, got ${rowCount}`);

  if (failures.length > 0) {
    console.error("\nT-E CONCURRENCY TEST FAILED:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }

  console.log("\nT-E CONCURRENCY TEST PASSED: exactly 1 success, 49 SLOT_TAKEN, 1 row in appointments.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
