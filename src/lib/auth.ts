import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "crypto";

const SESSION_COOKIE = "schema_ui_session";
const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

export type Session = {
  email: string;
  role: "admin" | "user";
  exp: number;
};

const base64UrlEncode = (value: string) =>
  Buffer.from(value).toString("base64url");

const base64UrlDecode = (value: string) =>
  Buffer.from(value, "base64url").toString("utf-8");

const sign = (payload: string, secret: string) =>
  createHmac("sha256", secret).update(payload).digest("base64url");

const timingSafeEqualString = (a: string, b: string) => {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
};

const getSecret = () => process.env.AUTH_SESSION_SECRET ?? "";

// Next's `cookies()` has historically returned a sync cookie store, but some versions/types
// model it as async. This shim supports both without forcing call sites to care.
const resolveCookies = async (): Promise<Awaited<ReturnType<typeof cookies>>> => {
  const cookieStoreOrPromise = cookies() as unknown;
  const then = (cookieStoreOrPromise as { then?: unknown } | null)?.then;

  if (typeof then === "function") {
    return (await cookieStoreOrPromise) as Awaited<ReturnType<typeof cookies>>;
  }

  return cookieStoreOrPromise as Awaited<ReturnType<typeof cookies>>;
};

export async function createSession(email: string) {
  const secret = getSecret();
  if (!secret) {
    throw new Error("Missing AUTH_SESSION_SECRET");
  }

  const adminEmails = (process.env.AUTH_ADMIN_EMAILS ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);

  const role = adminEmails.includes(email) ? "admin" : "user";
  const session: Session = {
    email,
    role,
    exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE,
  };

  const payload = base64UrlEncode(JSON.stringify(session));
  const signature = sign(payload, secret);
  const value = `${payload}.${signature}`;

  const cookieStore = await resolveCookies();
  cookieStore.set(SESSION_COOKIE, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
}

export async function clearSession() {
  const cookieStore = await resolveCookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const secret = getSecret();
  if (!secret) {
    return null;
  }

  const cookieStore = await resolveCookies();
  const cookie = cookieStore.get(SESSION_COOKIE)?.value;
  if (!cookie) {
    return null;
  }

  const [payload, signature] = cookie.split(".");
  if (!payload || !signature) {
    return null;
  }

  const expected = sign(payload, secret);
  if (!timingSafeEqualString(signature, expected)) {
    return null;
  }

  try {
    const data = JSON.parse(base64UrlDecode(payload)) as Session;
    if (!data.exp || data.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}
