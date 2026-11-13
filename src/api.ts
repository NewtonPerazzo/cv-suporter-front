export type Resume = { id: string; filename: string }
export type SessionState = { expires_at: string; server_time: string; documents: Resume[] }
export type Source = { filename: string; page: number; content: string }
export type Answer = { answer: string; sources: Source[] }

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message) }
}
const base = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

export async function request<T>(path: string, token?: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', 'Bearer ' + token)
  const response = await fetch(base + '/api/v1/chat' + path, { ...init, headers })
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new ApiError(response.status, typeof body.detail === 'string' ? body.detail : 'Unable to complete the request. Please try again.')
  }
  return response.status === 204 ? undefined as T : response.json()
}
