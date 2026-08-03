// Uniform error contract (§7.5): every API route maps a known error code to this shape.

export type ApiErrorCode =
  | "BUSINESS_NOT_FOUND"
  | "SERVICE_UNAVAILABLE"
  | "SLOT_TAKEN"
  | "INVALID_CUSTOMER"
  | "INVALID_STATE"
  | "TOKEN_INVALID"
  | "INVALID_RANGE"
  | "IDEMPOTENCY_KEY_REUSED"
  | "VALIDATION_ERROR"
  | "RATE_LIMITED"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "INTERNAL_ERROR";

const STATUS_BY_CODE: Record<ApiErrorCode, number> = {
  BUSINESS_NOT_FOUND: 404,
  SERVICE_UNAVAILABLE: 410,
  SLOT_TAKEN: 409,
  INVALID_CUSTOMER: 422,
  INVALID_STATE: 422,
  TOKEN_INVALID: 410,
  INVALID_RANGE: 422,
  IDEMPOTENCY_KEY_REUSED: 422,
  VALIDATION_ERROR: 422,
  RATE_LIMITED: 429,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  INTERNAL_ERROR: 500,
};

const MESSAGE_BY_CODE: Record<ApiErrorCode, string> = {
  BUSINESS_NOT_FOUND: "Negocio no encontrado.",
  SERVICE_UNAVAILABLE: "El servicio o profesional no está disponible.",
  SLOT_TAKEN: "Ese hueco acaba de ocuparse.",
  INVALID_CUSTOMER: "Se necesita email o teléfono de contacto.",
  INVALID_STATE: "La cita no se puede modificar en su estado actual.",
  TOKEN_INVALID: "El enlace de gestión no es válido o ha caducado.",
  INVALID_RANGE: "El rango de fechas solicitado no es válido.",
  IDEMPOTENCY_KEY_REUSED: "Esa Idempotency-Key ya se usó con una petición distinta.",
  VALIDATION_ERROR: "Datos de la petición inválidos.",
  RATE_LIMITED: "Demasiadas peticiones. Inténtalo de nuevo en unos minutos.",
  UNAUTHORIZED: "Es necesario iniciar sesión.",
  FORBIDDEN: "No tienes permiso para esta acción.",
  INTERNAL_ERROR: "Ha ocurrido un error inesperado.",
};

export class ApiError extends Error {
  code: ApiErrorCode;
  status: number;
  details?: unknown;

  constructor(code: ApiErrorCode, details?: unknown) {
    super(MESSAGE_BY_CODE[code]);
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }
}

const KNOWN_CODES = new Set<string>(Object.keys(STATUS_BY_CODE));

/** Maps a Postgres RPC error (raised via `raise exception '<CODE>'`) to an ApiError. */
export function fromPostgresError(error: { message?: string } | null | undefined): ApiError {
  const code = error?.message?.trim();
  if (code && KNOWN_CODES.has(code)) {
    return new ApiError(code as ApiErrorCode);
  }
  return new ApiError("INTERNAL_ERROR", error);
}

/**
 * Only these codes may carry `details` to the client. Everything else — above all
 * INTERNAL_ERROR, which wraps the raw Postgres error object — would otherwise hand the
 * caller table names, constraint names and statement fragments (audit finding V-06).
 * The full detail still reaches the server log, correlated by requestId.
 */
const CODES_WITH_PUBLIC_DETAILS = new Set<ApiErrorCode>(["VALIDATION_ERROR", "SLOT_TAKEN"]);

export function errorBody(err: ApiError, requestId: string) {
  return {
    error: err.code,
    message: err.message,
    requestId,
    details: CODES_WITH_PUBLIC_DETAILS.has(err.code) ? err.details ?? {} : {},
  };
}
