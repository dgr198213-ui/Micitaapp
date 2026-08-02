# Micitaapp

Plataforma de reservas B2B multi-tenant (tipo Booksy) para negocios de belleza y bienestar.
MVP: agenda y reservas online — sin marketplace, sin pagos online, sin app nativa. Ver
`docs/arquitectura.md` para la arquitectura técnica completa (dominios, ADRs, modelo de
datos, seguridad, roadmap) en la que se basa esta implementación.

## Stack

- **Next.js 15** (App Router, TypeScript, Tailwind CSS) — monolito modular, desplegado en Vercel.
- **Supabase**: Postgres 15+ como núcleo de correctitud (restricción de exclusión anti-solapamiento,
  RLS multi-tenant, funciones `SECURITY DEFINER` para el flujo público) + Auth.
- **Resend** para email transaccional, **Upstash Redis** para rate limiting (ambos opcionales en local).

## Estructura

```
supabase/
  migrations/     SQL versionado: esquema, RLS, restricción de exclusión, funciones
  seed.sql         3 negocios de ejemplo (barbería, salón, centro de bienestar)
  tests/           pgTAP: aislamiento RLS, anti-solapamiento, DST, políticas
src/
  app/             App Router: páginas públicas (/b, /r), panel (/app), admin, API routes
  modules/         Lógica de dominio: scheduling, catalog, resources, crm, notifications, tenancy
  lib/             Clientes Supabase (server/browser/public/admin), rate limiting
```

## Desarrollo local

### Camino recomendado (con Docker disponible)

```bash
pnpm install
pnpm db:start   # supabase start — Postgres + Auth + Studio locales vía Docker
pnpm db:reset   # aplica migraciones + seed.sql
pnpm db:test    # pgTAP vía Supabase CLI
pnpm dev
```

### Alternativa sin Docker (usada para construir y validar este repositorio)

Esta sesión de desarrollo se ejecutó en un entorno sin acceso al registro de imágenes
Docker (política de red del entorno), así que `supabase start` no podía descargar las
imágenes de Supabase. La base de datos y el conjunto de tests pgTAP se validaron igualmente
contra un **Postgres 16 nativo** (`apt install postgresql`) con un *shim* mínimo del schema
`auth` (`scripts/local_pg_auth_shim.sql` — recrea `auth.users`, `auth.uid()` y los roles
`anon`/`authenticated`/`service_role`; nunca se aplica a un proyecto Supabase real).

```bash
sudo apt-get install postgresql postgresql-contrib postgresql-16-pgtap pgtap
./scripts/reset_local_test_db.sh   # crea micitaapp_test, aplica todo, corre pgTAP
```

Todas las migraciones, la política RLS, la restricción de exclusión y las funciones RPC
están validadas con este método (20 tests pgTAP en verde). Lo que **no** se pudo ejecutar en
esta sesión por la misma razón: `supabase gen types typescript` contra un stack local (los
tipos de `src/modules/shared/database.types.ts` están escritos a mano, a la espera de
regenerarse contra un proyecto real) y las pruebas E2E de Playwright contra la pila completa
(PostgREST + GoTrue + Realtime), que sí están configuradas en `tests/e2e/` pero no se
ejecutaron contra un backend real.

### Variables de entorno

Copia `.env.example` a `.env.local` y rellena, como mínimo, las tres variables de Supabase
para poder arrancar `pnpm dev`. `RESEND_API_KEY`, `UPSTASH_REDIS_REST_URL/TOKEN` y
`CRON_SECRET` son opcionales en local (ver comentarios en el propio archivo).

## Tests

```bash
pnpm test        # Vitest: lógica pura (mapeo de errores, formateo de hora local, rate limit)
pnpm db:test      # pgTAP: RLS, restricción de exclusión (T-01), DST (T-02), rango a medianoche (T-03)
pnpm typecheck
pnpm lint
pnpm build
```

Casos de prueba críticos cubiertos en `supabase/tests/`:

| Test | Qué prueba |
|---|---|
| `01_rls_isolation.sql` | T-04 — un negocio no puede leer ni escribir datos de otro |
| `02_rls_enabled_everywhere.sql` | RLS activo en el 100% de las tablas de negocio |
| `03_no_overlap_constraint.sql` | T-01 (doble reserva imposible), RN-05 (cancelar libera el hueco), T-03 (medianoche) |
| `04_availability_dst_and_policy.sql` | T-02 (cambio de hora oct/mar), RN-04 (antelación mín/máx) |

## Despliegue (pendiente de credenciales del usuario)

Esta sesión no puede crear cuentas ni provisionar infraestructura real. Pasos para desplegar:

1. Crear proyecto Supabase en **región EU (Frankfurt)**. Aplicar las migraciones:
   `supabase link --project-ref <ref> && supabase db push`, luego (opcional) `supabase db seed`.
2. Crear proyecto Vercel, conectar el repo, configurar las variables de entorno de
   `.env.example` en producción (incluida `SUPABASE_SERVICE_ROLE_KEY`, solo server-side).
3. Activar **Vercel Cron** (usa `vercel.json`, ya incluido) y definir `CRON_SECRET` — debe
   coincidir con el header `Authorization: Bearer <CRON_SECRET>` que Vercel añade automáticamente.
4. Configurar Resend (dominio verificado) y, si se activa el add-on de SMS, Twilio.
5. Ejecutar el checklist de producción de `docs/arquitectura.md` §13.3 antes de facturar al
   primer cliente (RLS al 100%, PITR, cabeceras de seguridad, RAT/DPA revisados por un
   especialista en protección de datos — ver aviso legal en la propia arquitectura).

## Datos de ejemplo (`supabase/seed.sql`)

Tres negocios arquetípicos (§16.3): `barberia-lujan` (1 profesional), `salon-maria` (4
profesionales, servicios solapados), `centro-bienestar` (horario partido + festivos vía
`time_off`). Prueba el flujo público en `/b/barberia-lujan`, `/b/salon-maria` o
`/b/centro-bienestar`.

El seed crea filas de `auth.users` de ejemplo — esto solo funciona contra el shim local (ver
arriba). Contra un proyecto Supabase real, da de alta los negocios y sus owners a través del
flujo normal de Auth (registro o magic link) y usa las migraciones + `seed.sql` únicamente
como referencia para el catálogo/horarios de ejemplo.

## Decisiones y limitaciones conocidas

- **Reservas manuales sin notificación automática**: una cita creada por el dueño/staff
  (`/app/agenda` → "Cita manual") no encola `notification_jobs`. Es una decisión de alcance,
  no un olvido — el personal ya está atendiendo al cliente en persona o por teléfono. Un
  recordatorio de 24h para citas manuales de teléfono a futuro queda como mejora natural.
- **Un negocio por cuenta de owner/staff en el panel** (`getCurrentBusiness`): si una cuenta
  tuviera varias membresías, el panel usa la primera alfabéticamente. Multi-local es alcance
  post-MVP explícito (§15.2).
- **Token de gestión en `notification_jobs.payload`**: el email de confirmación/recordatorio
  necesita un enlace de gestión funcional; como solo se almacena el hash del token en
  `appointments`, el texto plano se guarda en el payload del job (visible solo para
  `service_role` y para el owner vía RLS) — ver comentario en `0007_public_booking.sql`.
- **SMS no activado por defecto** (ADR-007): el `channel` existe en el esquema pero el
  adaptador de Twilio no está implementado — ver §11.4 sobre el coste.
- **Widget embebible, sincronización con Google Calendar, pagos, marketplace**: fuera de
  alcance del MVP (§1.3).
