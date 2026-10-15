/**
 * Browser client for the FastAPI service.
 *
 * Set NEXT_PUBLIC_API_URL (or NEXT_PUBLIC_BACKEND_URL) to the FastAPI origin,
 * for example `http://localhost:8000`. Application endpoints are mounted
 * under FastAPI's `/api` prefix. The browser must never fall back to the
 * Next.js API routes: all application requests belong to FastAPI.
 */
const configuredApiOrigin = (
    process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000"
).replace(/\/$/, "");
const API_BASE_URL = configuredApiOrigin.endsWith("/api")
    ? configuredApiOrigin
    : `${configuredApiOrigin}/api`;

export function apiUrl(path: string): string {
    return `${API_BASE_URL}/${path.replace(/^\//, "")}`;
}

const TOKEN_KEY = "bis_access_token";

export function getAccessToken(): string | null {
    if (typeof window === "undefined") return null;
    try {
        return window.localStorage.getItem(TOKEN_KEY);
    } catch {
        return null;
    }
}

export function setAccessToken(token: unknown): void {
    if (typeof window === "undefined" || typeof token !== "string" || !token) return;
    try {
        window.localStorage.setItem(TOKEN_KEY, token);
    } catch {
        // Storage can be unavailable in privacy-restricted browser contexts.
    }
}

export function clearAccessToken(): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.removeItem(TOKEN_KEY);
    } catch {
        // Ignore storage failures; the server still receives the logout request.
    }
}

export function getTokenFromResponse(data: unknown): string | null {
    if (!data || typeof data !== "object") return null;
    const body = data as Record<string, unknown>;
    const token = body.access_token ?? body.accessToken ?? body.token;
    return typeof token === "string" && token ? token : null;
}

export async function readJson<T = unknown>(response: Response): Promise<T | null> {
    try {
        const text = await response.text();
        return text ? (JSON.parse(text) as T) : null;
    } catch {
        return null;
    }
}

export function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
    const token = getAccessToken();
    const headers = new Headers(options.headers);
    if (options.body && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }
    if (token && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
    }

    return fetch(apiUrl(path), {
        ...options,
        headers,
        // Supports FastAPI deployments that use an auth cookie in addition to
        // the bearer token. The API must allow the frontend origin for CORS.
        credentials: options.credentials ?? "include",
    });
}
