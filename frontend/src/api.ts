import type { Transaction, TransactionInput, User, Receipt } from "./types";
export const API_URL = import.meta.env.VITE_API_URL || "";
export const DEMO = !API_URL;
let accessToken = "";
let generation = 0;
let refreshPromise: Promise<User | null> | null = null;
export const SESSION_CLEARED = "finpulse:session-cleared";
export function clearToken() {
  accessToken = "";
  generation += 1;
  // Remounting the workspace clears transactions, chat, drafts, receipt data and modal state together.
  window.dispatchEvent(new Event(SESSION_CLEARED));
}
function current(epoch: number) {
  if (epoch !== generation)
    throw new Error("Your session changed. Please retry.");
}
async function errorFor(response: Response) {
  const body = await response.json().catch(() => ({}));
  return new Error(
    typeof body.detail === "string"
      ? body.detail
      : "Please check your input and try again.",
  );
}
export async function restoreSession(): Promise<User | null> {
  if (DEMO) return null;
  if (!refreshPromise) {
    const epoch = generation;
    const renew = async () => {
      current(epoch);
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      current(epoch);
      if (response.status === 401) return null;
      if (!response.ok) throw await errorFor(response);
      const data = await response.json();
      current(epoch);
      accessToken = data.access_token;
      return data.user as User;
    };
    // One renewal per tab plus a cross-tab browser lock avoids accidental refresh-token reuse.
    refreshPromise = (
      "locks" in navigator
        ? navigator.locks.request("finpulse-refresh", renew)
        : renew()
    ).finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}
async function authenticatedFetch(
  path: string,
  options: RequestInit = {},
): Promise<Response> {
  const epoch = generation;
  const send = () =>
    fetch(`${API_URL}${path}`, {
      ...options,
      credentials: "include",
      headers: {
        ...(options.body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...options.headers,
      },
    });
  let response = await send();
  current(epoch);
  // Refresh only on an authentication failure; never replay network failures or arbitrary 5xx writes.
  if (
    response.status === 401 &&
    !path.startsWith("/auth/login") &&
    !path.startsWith("/auth/register")
  ) {
    const restored = await restoreSession();
    current(epoch);
    if (!restored) {
      clearToken();
      throw new Error("Your session has ended. Please sign in.");
    }
    response = await send();
    current(epoch);
    if (response.status === 401) {
      clearToken();
      throw new Error("Please sign in again.");
    }
  }
  if (!response.ok) throw await errorFor(response);
  return response;
}
async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const epoch = generation;
  const response = await authenticatedFetch(path, options);
  const data =
    response.status === 204 ? (undefined as T) : ((await response.json()) as T);
  current(epoch); // Discard late responses from an earlier signed-in account.
  return data;
}
export interface DeviceSession {
  id: string;
  created_at: string;
  expires_at: string;
  current: boolean;
}
export const api = {
  async authenticate(
    mode: "login" | "register",
    values: Record<string, string>,
  ) {
    const data = await request<{ access_token: string; user: User }>(
      `/auth/${mode}`,
      { method: "POST", body: JSON.stringify(values) },
    );
    accessToken = data.access_token;
    return data.user;
  },
  async logout(all = false) {
    await request<void>(all ? "/auth/logout-all" : "/auth/logout", {
      method: "POST",
    });
    clearToken();
  },
  async changePassword(values: {
    current_password: string;
    new_password: string;
  }) {
    await request<void>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify(values),
    });
    clearToken();
  },
  sessions: () => request<DeviceSession[]>("/auth/sessions"),
  revokeSession: (id: string) =>
    request<void>(`/auth/sessions/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  async transactions(): Promise<Transaction[]> {
    const result: Transaction[] = [];
    for (let offset = 0; ; offset += 1000) {
      const page = await request<Transaction[]>(
        `/transactions?offset=${offset}&limit=1000`,
      );
      result.push(...page);
      if (page.length < 1000) return result;
    }
  },
  save: (data: TransactionInput, id?: number) =>
    request<Transaction>(`/transactions${id ? `/${id}` : ""}`, {
      method: id ? "PUT" : "POST",
      body: JSON.stringify(data),
    }),
  remove: (id: number) =>
    request<void>(`/transactions/${id}`, { method: "DELETE" }),
  log: (text: string) =>
    request<Transaction>("/ai/log", {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  scan: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<Receipt>("/ai/receipt", { method: "POST", body: form });
  },
  chat: (text: string) =>
    request<{ answer: string }>("/ai/advice", {
      method: "POST",
      body: JSON.stringify({ text }),
    }),
  async export(month: string, format: string) {
    const epoch = generation;
    const response = await authenticatedFetch(
      `/reports?month=${month}&format=${format}`,
    );
    const blob = await response.blob();
    current(epoch);
    return blob;
  },
};
