import { NextResponse } from "next/server";
import { ApiError, errorBody } from "./errors";
import { logEvent, newRequestId } from "./log";

type Handler = (requestId: string) => Promise<NextResponse>;

export async function withApiHandler(event: string, handler: Handler): Promise<NextResponse> {
  const requestId = newRequestId();
  const start = Date.now();
  try {
    const response = await handler(requestId);
    logEvent({ requestId, event, durationMs: Date.now() - start, outcome: "success" });
    response.headers.set("X-Request-Id", requestId);
    return response;
  } catch (err) {
    const apiError = err instanceof ApiError ? err : new ApiError("INTERNAL_ERROR", err instanceof Error ? err.message : err);
    logEvent({
      requestId,
      event,
      durationMs: Date.now() - start,
      outcome: "error",
      errorCode: apiError.code,
    });
    const body = errorBody(apiError, requestId) as Record<string, unknown>;
    const alternatives = (apiError as unknown as { alternatives?: unknown }).alternatives;
    if (alternatives) {
      body.details = { alternatives };
    }
    const response = NextResponse.json(body, { status: apiError.status });
    response.headers.set("X-Request-Id", requestId);
    return response;
  }
}
