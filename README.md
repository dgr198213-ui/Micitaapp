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
están validadas con este método (30 tests pgTAP en verde). Lo que **no** se pudo ejecutar en
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
pnpm test        # Vitest: lógica pura (mapeo de errores, formateo de hora local, rate limit, no-disclosure)
pnpm db:test      # pgTAP: RLS, restricción de exclusión (T-01), DST (T-02), rango a medianoche (T-03), regresión P0
pnpm typecheck
pnpm lint
pnpm build
```

Casos de prueba críticos cubiertos en `supabase/tests/`:

| Test | Qué prueba |
|---|---|
| `01_rls_isolation.sql` | T-04 — un negocio no puede leer ni escribir datos de otro |
| `02_rls_enabled_everywhere.sql` | RLS activo en TODA tabla de `public` (falla si se añade una tabla nueva sin RLS, no solo sobre una lista fija — corrección V-15) |
| `03_no_overlap_constraint.sql` | T-01 (doble reserva imposible), RN-05 (cancelar libera el hueco), T-03 (medianoche) |
| `04_availability_dst_and_policy.sql` | T-02 (cambio de hora oct/mar), RN-04 (antelación mín/máx) |
| `05_p0_regressions.sql` | Auditoría de seguridad del 2026-08-03 (ver más abajo): V-01, V-02, V-03, V-04, V-09 — exploits reproducidos contra el esquema anterior y re-verificados en verde tras el parche |

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

## Auditoría de seguridad (2026-08-03) y parche P0

Una auditoría externa sobre la primera versión del MVP encontró varios hallazgos críticos y
altos que se corrigen en `supabase/migrations/0011_p0_security_fixes.sql` (expand-only, no
rompe el esquema anterior) y en el código de aplicación asociado. Cada uno se reprodujo
contra los datos de seed antes del parche y se re-verificó en verde después, tanto en la
sesión que escribió el parche como de forma independiente en esta sesión
(`./scripts/reset_local_test_db.sh` → 30/30 pgTAP en verde, incluyendo el fichero
`05_p0_regressions.sql` dedicado a estos hallazgos).

| ID | Hallazgo | Severidad | Corrección |
|---|---|---|---|
| V-01 | Un negocio podía insertar una cita referenciando el `staff`/`service`/`customer` de **otro** negocio (las FK no estaban acotadas por `business_id`), rompiendo la agenda de la víctima | Crítica | Claves foráneas compuestas `(business_id, id)` — el estado incoherente ya no es representable |
| V-02 | La política RLS de `memberships` acotaba qué negocio administra el owner, pero no qué rol puede escribir: un owner podía auto-promocionarse a `platform_admin` | Crítica | Política de escritura reescrita: un owner no puede crear ni modificar filas con rol `platform_admin` (verificado: `DELETE 0`, `UPDATE 0`). La fila sigue siendo **legible** por los miembros del negocio a través de `memberships_business_read` — política de `SELECT` independiente que no filtra por rol y se combina por OR con la de escritura — así que un owner puede ver que existe un `platform_admin` en su negocio (expone solo `user_id` y rol). El aislamiento de lectura llega con el bloque 5.1 (tabla propia para `platform_admin`) |
| V-03 | `claim_notification_jobs` solo incrementaba `attempts`; el `FOR UPDATE SKIP LOCKED` se liberaba al terminar la transacción de reclamo, así que dos invocaciones de cron solapadas podían reenviar el mismo email | Crítica | Estado `processing` con `claimed_at` (arrendamiento de 5 min, recuperable si el worker muere) |
| V-04 | La comparación de horario laboral usaba aritmética de `time`, que es modular (23:50 + 35 min = 00:25): una reserva a las 23:50 se aceptaba en un negocio que cierra a las 20:00 | Alta | Comparación reescrita en espacio de `timestamp` local, sin envoltura modular |
| V-07 | El token de gestión en claro se guardaba también en `idempotency_keys.response_body`, quedando persistido indefinidamente | Alta | Ya no se cachea; una repetición idempotente devuelve `manageUrl: null` (el cliente ya lo tiene por email) + purga diaria |
| V-08 | Sin `RESEND_API_KEY`, el job se marcaba `sent` aunque no se enviara nada | Alta | En producción lanza excepción → el job cae a `failed` en vez de `sent` falso. **No** dispara ninguna alerta todavía: no existe sistema de alertas (Sentry, monitor de cola) en este repositorio — eso es el bloque 3, sin empezar, pendiente de credenciales |
| V-09 | El `ON CONFLICT` de clientes sobrescribía nombre/teléfono/consentimiento de un cliente ya existente con lo que escribiera un visitante anónimo que adivinara su email | Alta | El conflicto solo rellena huecos; nunca sobrescribe un valor ya presente |
| V-10 | Ventana de disponibilidad sin límite razonable (370 días) en un endpoint público sin autenticar — vector de agotamiento de CPU | Alta | Tope de 62 días en SQL + 31 días en el esquema Zod de la ruta |
| V-05, V-06, V-11, V-24 | Rate limiting fail-open en producción, errores 500 filtrando detalles internos, email del destinatario en logs, IP forjable | Media | Fail-closed en producción, lista blanca de `details` por código de error, log sin PII, cabecera `x-vercel-forwarded-for` preferida |
| V-22 | No existía job de purga (§8.8/§11.3 lo especifican) | Baja | `purge_expired_artifacts()` + cron diario 03:30 |

**Pendiente de decisión tuya, señalado explícitamente en el informe de remediación** (no
aplicado aquí para no ampliar el alcance del parche):

1. **Separar `platform_admin` a su propia tabla** sin permiso de escritura para
   `authenticated` — la política de V-02 tapa el agujero, pero una tabla propia evita que
   vuelva a abrirse en un refactor futuro. ~30 min de trabajo, recomendado antes del piloto.
2. **Observabilidad (Sentry + alerta de cola envejecida)** — sin esto, el fallo ruidoso de
   V-08 no sirve de nada: el job falla pero nadie lo ve.
3. **Test de concurrencia real (T-01)**: el requisito que el propio diseño llama *"el
   requisito del producto"* — 50 peticiones simultáneas al mismo hueco — sigue probado solo
   a nivel de restricción de exclusión (determinista, vía pgTAP), no con concurrencia real
   de red. Necesita un script fuera de pgTAP (k6 o Node con conexiones paralelas).
4. Entorno de staging, cierre real de citas (`completed`) antes de que el cron las marque
   `no_show`, inmutabilidad de `appointment_events`, CSP con `nonce`, escapado en emails.

**Antes de aplicar `0011` sobre un proyecto Supabase con datos reales**: las FK compuestas de
V-01 fallarán si ya existe alguna fila incoherente. Comprobar antes con:

```sql
select 'appointments/staff' as issue, count(*) from appointments a
  join staff s on s.id = a.staff_id where s.business_id <> a.business_id
union all
select 'appointments/service', count(*) from appointments a
  join services v on v.id = a.service_id where v.business_id <> a.business_id
union all
select 'appointments/customer', count(*) from appointments a
  join customers c on c.id = a.customer_id where c.business_id <> a.business_id;
```

Si todo devuelve 0 (esperable en un sistema sin tráfico previo), la migración entra limpia.

## Decisiones y limitaciones conocidas

- **Reservas manuales sin notificación automática**: una cita creada por el dueño/staff
  (`/app/agenda` → "Cita manual") no encola `notification_jobs`. Es una decisión de alcance,
  no un olvido — el personal ya está atendiendo al cliente en persona o por teléfono. Un
  recordatorio de 24h para citas manuales de teléfono a futuro queda como mejora natural.
- **Un negocio por cuenta de owner/staff en el panel** (`getCurrentBusiness`): si una cuenta
  tuviera varias membresías, el panel usa la primera alfabéticamente. Multi-local es alcance
  post-MVP explícito (§15.2).
- **Token de gestión en `notification_jobs.payload`, solo mientras el job está pendiente de
  envío**: el email de confirmación/recordatorio necesita un enlace de gestión funcional; como
  solo se almacena el hash del token en `appointments`, el texto plano viaja en el payload del
  job (visible solo para `service_role` y el owner vía RLS) hasta que `mark_notification_sent`
  lo borra tras el envío (V-07). Ya **no** se cachea en `idempotency_keys`: una repetición de
  `POST /bookings` con la misma `Idempotency-Key` devuelve `manageUrl: null` — el cliente debe
  usar el enlace de su email de confirmación, no el de la respuesta repetida.
- **SMS no activado por defecto** (ADR-007): el `channel` existe en el esquema pero el
  adaptador de Twilio no está implementado — ver §11.4 sobre el coste.
- **Widget embebible, sincronización con Google Calendar, pagos, marketplace**: fuera de
  alcance del MVP (§1.3).
