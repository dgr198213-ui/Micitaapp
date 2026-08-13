# Configuración del scheduler externo (cron-job.org)

Vercel Hobby solo permite cron con frecuencia diaria; el proyecto necesita uno cada minuto
(`notifications`). Para no subir a Vercel Pro en fase de piloto, los 4 jobs se disparan
desde [cron-job.org](https://cron-job.org) (gratis, granularidad de 1 minuto, sin límite de
jobs) en lugar de `vercel.json`.

## Requisito previo

`CRON_SECRET` debe estar configurado en las variables de entorno de producción de Vercel
(Project Settings → Environment Variables). Genera uno fuerte:

```bash
openssl rand -hex 32
```

Sin él, `/api/cron/*` **rechaza toda petición** en producción (`isAuthorizedCronRequest`) —
correcto: mejor un cron caído y visible que un endpoint abierto al público.

## Jobs a crear en cron-job.org

Crea una cuenta, y da de alta estos 4 jobs. En cada uno:

- **Method:** `GET`
- **Header personalizado:** `Authorization: Bearer <valor de CRON_SECRET>`
- **Notify on failure:** activar email — es la alerta mínima de §14.4 mientras no exista Sentry

| Job | URL | Schedule (cron-job.org) | Equivalente Vercel que sustituye |
|---|---|---|---|
| Notificaciones | `https://<tu-dominio>/api/cron/notifications` | cada minuto (`* * * * *`) | `* * * * *` |
| Expirar pendientes | `https://<tu-dominio>/api/cron/expire-pending` | cada 5 min (`*/5 * * * *`) | `*/5 * * * *` |
| Auto-cierre de citas caducadas | `https://<tu-dominio>/api/cron/auto-complete-stale` | cada hora en punto (`0 * * * *`) | `0 * * * *` |
| Purga de artefactos expirados | `https://<tu-dominio>/api/cron/purge` | 03:30 UTC diario (`30 3 * * *`) | `30 3 * * *` |

Sustituye `<tu-dominio>` por el dominio de producción una vez desplegado (p. ej.
`micitaapp.vercel.app` o el dominio propio).

## Verificación tras darlos de alta

```bash
curl -i https://<tu-dominio>/api/cron/notifications \
  -H "Authorization: Bearer <CRON_SECRET>"
# → 200

curl -i https://<tu-dominio>/api/cron/notifications
# → 401, sin cabecera de autorización
```

cron-job.org guarda el historial de cada ejecución (código de respuesta, duración) en su
panel — es la única visibilidad de estos jobs mientras no exista el bloque de
observabilidad (V-17). Revísalo manualmente los primeros días.

## Vuelta atrás a Vercel Cron

Si el proyecto sube a Vercel Pro más adelante (uso comercial, más volumen, se quiere
quitar la dependencia de un tercero gratuito), basta con:

1. Reintroducir el bloque `crons` en `vercel.json` con las mismas rutas y expresiones.
2. Desactivar los 4 jobs en cron-job.org.
3. `CRON_SECRET` no cambia — Vercel Cron lo envía con el mismo formato `Authorization: Bearer`.

No hay que tocar ni una línea de `src/app/api/cron/*`: los endpoints no saben ni les
importa quién los llama, solo verifican el secreto.
