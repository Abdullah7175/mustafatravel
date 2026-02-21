// src/lib/http.ts
import axios, { InternalAxiosRequestConfig } from "axios";

/** ---------- Config ---------- **/
// Helper to normalize hostname or full URL to always use www.mustafatravel.com
const normalizeHostname = (hostname: string): string => {
  // If hostname is mustafatravel.com, return www.mustafatravel.com
  if (hostname === 'mustafatravel.com') {
    return 'www.mustafatravel.com';
  }
  // If hostname already has www or is localhost, return as is
  if (hostname.includes('www.') || hostname === 'localhost' || hostname.includes('localhost:')) {
    return hostname;
  }
  // For other domains without www, add www (optional - can be removed if not needed)
  // For now, only handle mustafatravel.com specifically
  return hostname;
};

// Helper to normalize API base URL (same pattern as Marwah/Holy so dashboard and bookings load)
const normalizeApiBase = (baseUrl: string | undefined): string => {
  // If VITE_API_BASE is explicitly set, use it
  if (baseUrl) {
    try {
      const url = new URL(baseUrl);
      if (url.hostname === 'booking.mustafatravelsandtour.com') {
        url.hostname = 'www.booking.mustafatravelsandtour.com';
        return url.toString().replace(/\/$/, '');
      }
      return baseUrl.replace(/\/$/, '');
    } catch {
      const normalized = normalizeHostname(baseUrl);
      return typeof window !== "undefined"
        ? `${window.location.protocol}//${normalized}`
        : `https://${normalized}`;
    }
  }

  // When VITE_API_BASE is not set: dev → backend port; production → same-origin for proxy
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    const protocol = window.location.protocol;

    // Development: point directly to backend so /api/bookings and dashboard data load
    if (hostname === 'localhost' || hostname === '127.0.0.1') {
      return 'http://localhost:7000';
    }

    // Production: use same origin so Nginx can proxy /api/* to backend
    if (hostname.includes('mustafatravelsandtour') || hostname === 'booking.mustafatravelsandtour.com') {
      return '';
    }

    const normalized = normalizeHostname(hostname);
    return `${protocol}//${normalized}`;
  }

  return "http://localhost:7000";
};

const API_BASE = normalizeApiBase(import.meta.env.VITE_API_BASE);

const isDev = import.meta.env.DEV === true;

/** Normalize values like: ObjectId("..."), quoted strings, stray spaces */
const normalizeCompanyId = (val?: unknown): string | null => {
  if (!val) return null;
  let s = typeof val === "string" ? val : String(val);
  s = s.trim();

  // strip ObjectId("...") wrapper
  const m = s.match(/^ObjectId\(["']?([0-9a-fA-F]{24})["']?\)$/);
  if (m) s = m[1];

  // strip surrounding quotes
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1);
  }
  return s.trim() || null;
};

/** Try to read company id from several places */
const getCompanyId = (): string | null => {
  // 1) localStorage (authoritative after login)
  const fromLS = normalizeCompanyId(localStorage.getItem("companyId"));
  if (fromLS) return fromLS;

  // 2) URL ?companyId= (handy for first boot)
  if (typeof window !== "undefined") {
    const url = new URL(window.location.href);
    const fromQuery = normalizeCompanyId(url.searchParams.get("companyId"));
    if (fromQuery) return fromQuery;
  }

  // 3) Vite env fallback (optional)
  const fromEnv = normalizeCompanyId(
    import.meta.env.VITE_COMPANY_ID as string | undefined
  );
  if (fromEnv) return fromEnv;

  return null;
};

const getToken = (): string | null => {
  const t = localStorage.getItem("token");
  return t && t.trim() ? t : null;
};

/** ---------- Axios Instance ---------- **/
export const http = axios.create({
  baseURL: API_BASE,
  timeout: 20000,
  // Kill cache globally to avoid 304 with empty bodies
  headers: {
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    Expires: "0",
  },
});

/** ---------- Request Interceptor ---------- **/
http.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  // Always send Authorization when present
  const token = getToken();
  if (token) {
    config.headers = config.headers || {};
    (config.headers as any).Authorization = `Bearer ${token}`;
  }

  // Always send x-company-id when we have it
  const companyId = getCompanyId();
  if (companyId) {
    config.headers = config.headers || {};
    (config.headers as any)["x-company-id"] = companyId;
  }

  // Bust cache for /me endpoints explicitly (some browsers cache aggressively)
  const url = (config.url || "").toString();
  const isMeEndpoint =
    url.includes("/api/auth/me") || url.includes("/api/agent/me");
  if (isMeEndpoint) {
    const ts = Date.now();
    // merge params safely
    (config.params as any) = { ...(config.params || {}), _: ts };
  }

  if (isDev) {
    // eslint-disable-next-line no-console
    console.debug(
      "[http] →",
      (config.method || "get").toUpperCase(),
      config.baseURL ? config.baseURL + (config.url || "") : config.url,
      {
        hasToken: !!token,
        companyId: (config.headers as any)?.["x-company-id"] || null,
      }
    );
  }

  return config;
});

/** ---------- Response Interceptor (optional) ---------- **/
http.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err?.response?.status === 401) {
      localStorage.removeItem("token");
      // optional redirect to login:
      // window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

/** ---------- Small helpers for auth setup ---------- **/
export const auth = {
  setToken(token: string) {
    localStorage.setItem("token", token);
  },
  clearToken() {
    localStorage.removeItem("token");
  },
  setCompanyId(companyId: string) {
    const normalized = normalizeCompanyId(companyId);
    if (normalized) localStorage.setItem("companyId", normalized);
  },
  clearCompanyId() {
    localStorage.removeItem("companyId");
  },
};

export default http;
