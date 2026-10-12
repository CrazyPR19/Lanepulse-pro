// LanePulse Pro - frontend API client

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function req<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {}),
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const msg =
      (data && (data.error || data.message)) ||
      `Request failed (${res.status})`;
    throw new ApiError(msg, res.status, data?.code);
  }
  return data as T;
}

export const api = {
  get: <T>(url: string) => req<T>(url),
  post: <T>(url: string, body?: any) =>
    req<T>(url, { method: "POST", body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(url: string, body?: any) =>
    req<T>(url, { method: "PATCH", body: body ? JSON.stringify(body) : undefined }),
  put: <T>(url: string, body?: any) =>
    req<T>(url, { method: "PUT", body: body ? JSON.stringify(body) : undefined }),
  del: <T>(url: string, body?: any) =>
    req<T>(url, { method: "DELETE", body: body ? JSON.stringify(body) : undefined }),
};
