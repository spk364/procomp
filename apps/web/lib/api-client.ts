import { z } from 'zod'

// Minimal Match schema aligned with Dashboard types
export const MatchSchema = z.object({
  id: z.string(),
  tournamentId: z.string().optional(),
  category: z.string().optional(),
  division: z.string().optional(),
  bracket: z.string().optional(),
  position: z.string().optional(),
  athlete1Id: z.string().optional().nullable(),
  athlete2Id: z.string().optional().nullable(),
  athlete1Name: z.string().optional().nullable(),
  athlete2Name: z.string().optional().nullable(),
  status: z.enum(['waiting', 'active', 'completed']),
  score1: z.number().optional().nullable(),
  score2: z.number().optional().nullable(),
  winnerAthleteId: z.string().optional().nullable(),
  refereeId: z.string().optional().nullable(),
  refereeName: z.string().optional().nullable(),
  matNumber: z.number().optional().nullable(),
  startTime: z.string().optional().nullable(),
  endTime: z.string().optional().nullable(),
  hudActive: z.boolean().optional().nullable(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
})
export type MatchDTO = z.infer<typeof MatchSchema>

const ApiErrorSchema = z.object({
  detail: z.union([z.string(), z.array(z.any())]).optional(),
  message: z.string().optional(),
  status: z.number().optional(),
})
export class ApiClientError extends Error {
  status: number
  data: unknown
  constructor(message: string, status: number, data?: unknown) {
    super(message)
    this.name = 'ApiClientError'
    this.status = status
    this.data = data
  }
}

async function parseJsonSafe<T = unknown>(res: Response): Promise<T | null> {
  try { return await res.json() as T } catch { return null }
}

async function handleResponse<T>(res: Response, schema?: z.ZodSchema<T>): Promise<T | void> {
  if (!res.ok) {
    const data = await parseJsonSafe(res)
    const err = ApiErrorSchema.safeParse(data)
    const msg = err.success ? (err.data.message || err.data.detail || 'Request failed') : 'Request failed'
    throw new ApiClientError(typeof msg === 'string' ? msg : 'Request failed', res.status, data)
  }
  if (schema) {
    const data = await res.json()
    const parsed = schema.parse(data)
    return parsed
  }
}

function buildUrl(path: string, params?: Record<string, string | number | boolean | undefined>) {
  const url = new URL(path, typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000')
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) url.searchParams.set(k, String(v))
    })
  }
  return url.toString()
}

const defaultInit: RequestInit = {
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
}

export const api = {
  async assignReferee(matchId: string, refereeId: string) {
    const res = await fetch(buildUrl(`/api/matches/${matchId}/assign-referee`), {
      ...defaultInit,
      method: 'PATCH',
      body: JSON.stringify({ refereeId }),
    })
    return handleResponse(res, MatchSchema)
  },

  async startMatch(matchId: string) {
    const res = await fetch(buildUrl(`/api/matches/${matchId}/start`), {
      ...defaultInit,
      method: 'POST',
    })
    return handleResponse(res, MatchSchema)
  },

  async pauseMatch(matchId: string) {
    const res = await fetch(buildUrl(`/api/matches/${matchId}/pause`), {
      ...defaultInit,
      method: 'POST',
    })
    return handleResponse(res, MatchSchema)
  },

  async endMatch(matchId: string) {
    const res = await fetch(buildUrl(`/api/matches/${matchId}/end`), {
      ...defaultInit,
      method: 'POST',
    })
    return handleResponse(res, MatchSchema)
  },

  async toggleHud(matchId: string) {
    const res = await fetch(buildUrl(`/api/matches/${matchId}/hud`), {
      ...defaultInit,
      method: 'POST',
    })
    return handleResponse(res, MatchSchema)
  },

  async exportMatch(matchId: string, format: 'json' = 'json') {
    const res = await fetch(buildUrl(`/api/matches/${matchId}/export`, { format }), {
      credentials: 'include',
    })
    if (!res.ok) {
      const data = await parseJsonSafe(res)
      const err = ApiErrorSchema.safeParse(data)
      const msg = err.success ? (err.data.message || err.data.detail || 'Export failed') : 'Export failed'
      throw new ApiClientError(typeof msg === 'string' ? msg : 'Export failed', res.status, data)
    }
    if (format === 'json') {
      const data = await res.json()
      // Validate JSON response can be either Match or array/object; best-effort parse as Match
      const parsed = MatchSchema.safeParse(data)
      return parsed.success ? parsed.data : data
    }
    const blob = await res.blob()
    return blob
  },
}