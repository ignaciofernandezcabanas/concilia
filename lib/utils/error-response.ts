import { NextResponse } from "next/server";

/**
 * Sanitized error response. In production, never exposes internal details.
 */
export function errorResponse(message: string, error: unknown, status = 500): NextResponse {
  const detail = error instanceof Error ? error.message : String(error);
  console.error(`[${status}] ${message}:`, detail);
  return NextResponse.json(
    { error: message, ...(process.env.NODE_ENV !== "production" ? { detail } : {}) },
    { status }
  );
}
