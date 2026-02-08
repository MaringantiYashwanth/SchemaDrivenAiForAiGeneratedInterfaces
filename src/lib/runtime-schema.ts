import { z } from "zod";

export type SchemaLoadErrorKind =
  | "invalid-url"
  | "http"
  | "network"
  | "aborted"
  | "invalid-json"
  | "validation";

export class SchemaLoadError extends Error {
  public readonly kind: SchemaLoadErrorKind;
  public readonly details?: string;

  constructor(kind: SchemaLoadErrorKind, message: string, details?: string) {
    super(message);
    this.name = "SchemaLoadError";
    Object.setPrototypeOf(this, new.target.prototype);
    this.kind = kind;
    this.details = details;
  }
}

export function isSupportedSchemaUrl(url: string): boolean {
  if (url.startsWith("//")) return false;
  return url.startsWith("/") || url.startsWith("https://") || url.startsWith("http://");
}

export function formatZodError(error: z.ZodError): string {
  const lines = error.issues.map((issue) => {
    const path = issue.path.length ? issue.path.join(".") : "(root)";
    return `${path}: ${issue.message}`;
  });

  return lines.join("\n");
}

export function validateJsonPayload<T>(
  payload: unknown,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): T {
  const parsed = schema.safeParse(payload);

  if (!parsed.success) {
    throw new SchemaLoadError(
      "validation",
      "Schema payload did not match the expected shape.",
      formatZodError(parsed.error),
    );
  }

  return parsed.data;
}

export async function fetchJson(url: string, signal?: AbortSignal): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new SchemaLoadError("aborted", "Schema request was aborted.");
    }

    const details = process.env.NODE_ENV !== "production" ? String(error) : undefined;
    throw new SchemaLoadError("network", "Failed to fetch schema.", details);
  }

  if (!response.ok) {
    const contentType = response.headers.get("content-type");
    const details = `status=${response.status} statusText=${response.statusText} content-type=${contentType ?? "(missing)"}`;
    throw new SchemaLoadError(
      "http",
      `Schema request failed with status ${response.status}.`,
      details,
    );
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!/json/i.test(contentType)) {
    throw new SchemaLoadError(
      "invalid-json",
      "Schema response did not have a JSON content-type.",
      `content-type=${contentType || "(missing)"}`,
    );
  }

  try {
    return await response.json();
  } catch {
    throw new SchemaLoadError("invalid-json", "Schema response was not valid JSON.");
  }
}

export async function loadAndValidateJson<T>(
  url: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  if (!isSupportedSchemaUrl(url)) {
    throw new SchemaLoadError(
      "invalid-url",
      "Schema URL must be a relative path (starting with /) or an http(s) URL.",
      `Received: ${url}`,
    );
  }

  const payload = await fetchJson(url, signal);
  return validateJsonPayload(payload, schema);
}
