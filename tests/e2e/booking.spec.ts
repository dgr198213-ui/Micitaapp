import { expect, test } from "@playwright/test";

// Requires a running app pointed at a Supabase project seeded with supabase/seed.sql
// (see README "Desarrollo local"). Not executed against a live backend in the session that
// wrote this file — no Docker-based local Supabase stack was reachable there (blocked
// registry pulls) and no cloud project credentials were available either.

test.describe("public booking flow (§16.1 'Reservar')", () => {
  test("a visitor can book the first available slot for a service", async ({ page }) => {
    await page.goto("/b/barberia-lujan");

    await expect(page.getByRole("heading", { name: "Barbería Luján" })).toBeVisible();

    // Step 1: pick a service.
    await page.getByRole("button", { name: /Corte de pelo/ }).click();

    // Step 2: pick the first available slot (dates/times are dynamic, so we just take
    // whichever the availability API returns first).
    const firstSlot = page.locator("button", { hasText: /^\d{2}:\d{2}$/ }).first();
    await expect(firstSlot).toBeVisible({ timeout: 15_000 });
    await firstSlot.click();

    // Step 3: contact details.
    await page.getByPlaceholder("Nombre").fill("Cliente de Prueba");
    await page.getByPlaceholder("Email").fill(`e2e-${Date.now()}@example.com`);
    await page.getByRole("button", { name: "Confirmar reserva" }).click();

    await expect(page.getByText("¡Reserva confirmada!")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole("link", { name: /Gestionar mi cita/ })).toBeVisible();
  });

  test("a confirmed booking can be cancelled from its manage link", async ({ page }) => {
    await page.goto("/b/barberia-lujan");
    await page.getByRole("button", { name: /Corte \+ barba/ }).click();

    const firstSlot = page.locator("button", { hasText: /^\d{2}:\d{2}$/ }).first();
    await expect(firstSlot).toBeVisible({ timeout: 15_000 });
    await firstSlot.click();

    await page.getByPlaceholder("Nombre").fill("Cliente Cancelación");
    await page.getByPlaceholder("Teléfono").fill("+34600123456");
    await page.getByRole("button", { name: "Confirmar reserva" }).click();
    await expect(page.getByText("¡Reserva confirmada!")).toBeVisible({ timeout: 15_000 });

    await page.getByRole("link", { name: /Gestionar mi cita/ }).click();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Cancelar cita" }).click();
    await expect(page.getByText("Cancelada")).toBeVisible({ timeout: 15_000 });
  });
});
