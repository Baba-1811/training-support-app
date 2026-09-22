import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Uses the real @supabase/ssr + auth-js client. Only the network (fetch), the cookie store
// and the DB layer are replaced, so this guards the actual PKCE contract between signUp,
// the verifier cookie and /auth/confirm?code=... .
const mocks = vi.hoisted(() => ({ profile: vi.fn(), report: vi.fn(), jar: new Map<string, string>() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    getAll: () => [...mocks.jar].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string, options?: { maxAge?: number }) => {
      if (value === "" || options?.maxAge === 0) mocks.jar.delete(name);
      else mocks.jar.set(name, value);
    },
  }),
}));
vi.mock("@/lib/auth/profile", () => ({ ensureProfile: mocks.profile, reportProfileFailure: mocks.report }));
vi.mock("next/navigation", () => ({ redirect: (path: string) => { throw new Error("REDIRECT:" + path); } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
import { signup } from "@/app/(auth)/actions";
import { GET } from "@/app/auth/confirm/route";

const b64url = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
const authUser = {
  id: "11111111-1111-4111-8111-111111111111", aud: "authenticated", role: "authenticated",
  email: "owner@example.com", email_confirmed_at: "2026-09-21T00:00:00Z",
  app_metadata: {}, user_metadata: { name: "太郎" }, identities: [{ id: "identity" }], created_at: "2026-09-21T00:00:00Z",
};
const session = {
  access_token: `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url({ sub: authUser.id, exp: 4102444800, aud: "authenticated" })}.sig`,
  token_type: "bearer", expires_in: 3600, expires_at: 4102444800, refresh_token: "refresh", user: authUser,
};
type Call = { method: string; path: string; search: URLSearchParams; body: Record<string, string> };
let calls: Call[];
let exchangeStatus: number;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.jar.clear();
  calls = [];
  exchangeStatus = 200;
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-public-key");
  vi.stubEnv("APP_URL", "http://localhost:3000");
  mocks.profile.mockResolvedValue({ id: authUser.id });
  vi.stubGlobal("fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
    calls.push({ method: init?.method ?? "GET", path: url.pathname, search: url.searchParams, body });
    if (url.pathname === "/auth/v1/signup") return json({ ...authUser, email_confirmed_at: null });
    if (url.pathname === "/auth/v1/token") {
      return exchangeStatus === 200 ? json(session) : json({ code: 400, error_code: "flow_state_not_found", msg: "invalid flow state" }, 400);
    }
    if (url.pathname === "/auth/v1/user") return json(authUser);
    return json({}, 404);
  });
});

function signupForm() {
  const data = new FormData();
  Object.entries({ email: authUser.email, password: "password123", name: "太郎" }).forEach(([k, v]) => data.set(k, v));
  return data;
}
const confirm = (query: string) => GET(new NextRequest("http://localhost:3000/auth/confirm?" + query));
const verifierCookies = () => [...mocks.jar.keys()].filter((name) => name.endsWith("code-verifier"));

describe("real @supabase/ssr PKCE flow", () => {
  it("signup stores a verifier cookie and sends the challenge with the fixed redirect URL", async () => {
    await expect(signup({}, signupForm())).rejects.toThrow("REDIRECT:/check-email");
    const signUp = calls.find((call) => call.path === "/auth/v1/signup")!;
    // Exactly the fixed URL: the route relies on the fixed verifier key, so an appended
    // sb_flow_id (experimental option) would need explicit handling in /auth/confirm.
    expect(signUp.search.get("redirect_to")).toBe("http://localhost:3000/auth/confirm");
    expect(mocks.jar.has("sb-example-auth-token-code-verifier")).toBe(true);
    expect(signUp.body.code_challenge).toBeTruthy();
    expect(signUp.body.code_challenge_method).toBe("s256");
    expect(verifierCookies().length).toBeGreaterThan(0);
  });

  it("confirms with ?code= in the same browser: proves the verifier, then verifies the user before creating a profile", async () => {
    await expect(signup({}, signupForm())).rejects.toThrow("REDIRECT:/check-email");
    mocks.profile.mockClear();
    calls = [];
    const result = await confirm("code=auth-code-from-supabase&type=signup");
    expect(result.headers.get("location")).toBe("http://localhost:3000/");
    const paths = calls.map((call) => call.path);
    expect(paths.slice(0, 2)).toEqual(["/auth/v1/token", "/auth/v1/user"]);
    const exchange = calls[0];
    expect(exchange.search.get("grant_type")).toBe("pkce");
    expect(exchange.body.auth_code).toBe("auth-code-from-supabase");
    expect(exchange.body.code_verifier).toBeTruthy();
    expect(mocks.profile).toHaveBeenCalledOnce();
    expect(mocks.profile.mock.calls[0][0]).toMatchObject({ id: authUser.id, email: authUser.email });
    expect(mocks.profile.mock.calls[0][1]).toBe(true);
    // The session is now established in cookies and the fixed verifier key is consumed.
    // (auth-js may keep spent per-flow slot cookies; their codes are already single-use.)
    expect(mocks.jar.has("sb-example-auth-token")).toBe(true);
    expect(mocks.jar.has("sb-example-auth-token-code-verifier")).toBe(false);
  });

  it("binds the exchanged verifier to the signup challenge", async () => {
    await expect(signup({}, signupForm())).rejects.toThrow("REDIRECT:/check-email");
    const sentChallenge = calls.find((call) => call.path === "/auth/v1/signup")!.body.code_challenge;
    calls = [];
    await confirm("code=abc");
    const sentVerifier = calls.find((call) => call.path === "/auth/v1/token")!.body.code_verifier;
    expect(createHash("sha256").update(sentVerifier).digest("base64url")).toBe(sentChallenge);
  });

  it("fails closed without exchanging when opened in a browser without the verifier cookie", async () => {
    await expect(signup({}, signupForm())).rejects.toThrow("REDIRECT:/check-email");
    mocks.jar.clear(); // another browser/device
    mocks.profile.mockClear();
    calls = [];
    const result = await confirm("code=auth-code-from-supabase");
    expect(result.headers.get("location")).toContain("/auth/error");
    expect(calls.some((call) => call.path === "/auth/v1/token" && call.body.code_verifier)).toBe(false);
    expect(calls.some((call) => call.path === "/auth/v1/user")).toBe(false);
    expect(mocks.profile).not.toHaveBeenCalled();
    expect(mocks.jar.size).toBe(0);
  });

  it("does not create a profile when Auth rejects the code (expired/reused)", async () => {
    await expect(signup({}, signupForm())).rejects.toThrow("REDIRECT:/check-email");
    mocks.profile.mockClear();
    exchangeStatus = 400;
    const result = await confirm("code=used-code");
    expect(result.headers.get("location")).toContain("/auth/error");
    expect(mocks.profile).not.toHaveBeenCalled();
  });

  it("does not touch Auth for Supabase error redirects", async () => {
    calls = [];
    const result = await confirm("error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired");
    expect(result.headers.get("location")).toContain("/auth/error");
    expect(calls).toHaveLength(0);
  });
});
