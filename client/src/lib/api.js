/**
 * The single place the client talks to the API. Every call goes through here so that
 * auth headers, error shape and the base URL have one definition rather than twelve.
 */
const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export async function request(path, { method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    credentials: 'include',
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const error = payload?.error ?? {};
    throw new ApiError(response.status, error.code ?? 'unknown', error.message ?? response.statusText);
  }

  return payload;
}

export const api = {
  health: () => request('/health'),
};
