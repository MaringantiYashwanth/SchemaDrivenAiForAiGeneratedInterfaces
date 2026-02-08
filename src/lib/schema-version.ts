export const LEGACY_SCHEMA_VERSION = "0";

export const SUPPORTED_SCHEMA_MAJOR_VERSIONS = [1] as const;

export type SchemaVersionInfo =
  | { status: "supported"; raw: string; major: number }
  | { status: "legacy"; raw: string; major: 0 }
  | { status: "unsupported"; raw: string; major: number }
  | { status: "invalid"; raw: string };

type ParsedSchemaVersion = {
  major: number;
  minor?: number;
  patch?: number;
};

export function parseSchemaVersion(raw: string): ParsedSchemaVersion | null {
  const trimmed = raw.trim();
  const match = trimmed.match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?$/);
  if (!match) return null;

  const major = Number(match[1]);
  if (!Number.isFinite(major)) return null;

  const minor = match[2] === undefined ? undefined : Number(match[2]);
  if (minor !== undefined && !Number.isFinite(minor)) return null;

  const patch = match[3] === undefined ? undefined : Number(match[3]);
  if (patch !== undefined && !Number.isFinite(patch)) return null;

  return { major, minor, patch };
}

export function getSchemaVersionInfo(raw: string): SchemaVersionInfo {
  const trimmed = raw.trim();
  const parsed = parseSchemaVersion(trimmed);

  if (!parsed) {
    return { status: "invalid", raw: trimmed };
  }

  if (parsed.major === 0) {
    return { status: "legacy", raw: trimmed, major: 0 };
  }

  if (SUPPORTED_SCHEMA_MAJOR_VERSIONS.includes(parsed.major as (typeof SUPPORTED_SCHEMA_MAJOR_VERSIONS)[number])) {
    return { status: "supported", raw: trimmed, major: parsed.major };
  }

  return { status: "unsupported", raw: trimmed, major: parsed.major };
}
