'use client'

import { create } from 'zustand'
import { persist, type PersistOptions } from 'zustand/middleware'
import type { Match, Referee } from '../page'
import { api } from '../../../lib/api-client.runtime'

export type SortKey = 'status' | 'mat' | 'referee' | 'updatedAt'
export type SortDirection = 'asc' | 'desc'

interface PendingChange {
  prev: Partial<Match>
  next: Partial<Match>
}

interface MatchStoreState {
  matches: Match[]
  referees: Referee[]
  searchQuery: string
  sortKey: SortKey
  sortDirection: SortDirection
  pending: Record<string, PendingChange | undefined>
  inFlight: Record<string, boolean>

  setMatches: (matches: Match[]) => void
  upsertMatch: (match: Match) => void
  setReferees: (refs: Referee[]) => void
  upsertReferee: (ref: Referee) => void

  setSearchQuery: (q: string) => void
  setSort: (key: SortKey) => void
  setSortExplicit: (key: SortKey, direction: SortDirection) => void

  applySearchAndSort: (rows: Match[]) => Match[]

  // optimistic actions
  assignReferee: (matchId: string, refereeId: string) => Promise<void>
  startMatch: (matchId: string) => Promise<void>
  pauseMatch: (matchId: string) => Promise<void>
  endMatch: (matchId: string) => Promise<void>
  toggleHud: (matchId: string) => Promise<void>

  reconcileFromWS: (incoming: Match) => void
}

function normalize(s?: string | null) {
  return (s || '').toLowerCase().trim()
}

function sortMatches(matches: Match[], key: SortKey, dir: SortDirection) {
  const factor = dir === 'asc' ? 1 : -1
  return [...matches].sort((a, b) => {
    switch (key) {
      case 'status':
        return factor * normalize(a.status).localeCompare(normalize(b.status))
      case 'mat':
        return factor * ((a.matNumber || 0) - (b.matNumber || 0))
      case 'referee':
        return factor * normalize(a.refereeName).localeCompare(normalize(b.refereeName))
      case 'updatedAt':
        return factor * (new Date(a.updatedAt || 0).getTime() - new Date(b.updatedAt || 0).getTime())
      default:
        return 0
    }
  })
}

export const useMatchStore = create<MatchStoreState>()(
  persist<MatchStoreState>(
    (set, get) => ({
      matches: [],
      referees: [],
      searchQuery: '',
      sortKey: 'updatedAt',
      sortDirection: 'desc',
      pending: {},
      inFlight: {},

      setMatches: (matches: Match[]) => set({ matches }),
      upsertMatch: (match: Match) => set((state: MatchStoreState) => ({
        matches: state.matches.some((m: Match) => m.id === match.id)
          ? state.matches.map((m: Match) => (m.id === match.id ? match : m))
          : [match, ...state.matches],
      })),
      setReferees: (refs: Referee[]) => set({ referees: refs }),
      upsertReferee: (ref: Referee) => set((state: MatchStoreState) => ({
        referees: state.referees.some((r: Referee) => r.id === ref.id)
          ? state.referees.map((r: Referee) => (r.id === ref.id ? ref : r))
          : [ref, ...state.referees],
      })),

      setSearchQuery: (q: string) => set({ searchQuery: q }),
      setSort: (key: SortKey) => set((state: MatchStoreState) => ({
        sortKey: key,
        sortDirection: state.sortKey === key && state.sortDirection === 'asc' ? 'desc' : 'asc',
      })),
      setSortExplicit: (key: SortKey, direction: SortDirection) => set({ sortKey: key, sortDirection: direction }),

      applySearchAndSort: (rows: Match[]) => {
        const { searchQuery, sortKey, sortDirection } = get() as MatchStoreState
        const q = normalize(searchQuery)
        const filtered = q
          ? rows.filter((m: Match) =>
              normalize(m.category).includes(q) ||
              normalize(m.division).includes(q) ||
              normalize(m.athlete1Name).includes(q) ||
              normalize(m.athlete2Name).includes(q) ||
              normalize(m.refereeName).includes(q) ||
              String(m.matNumber || '').includes(q)
            )
          : rows
        return sortMatches(filtered, sortKey, sortDirection)
      },

      async assignReferee(matchId: string, refereeId: string) {
        const state = get() as MatchStoreState
        if (state.inFlight[matchId]) return
        const current = state.matches.find((m: Match) => m.id === matchId)
        if (!current) return
        const prev: Partial<Match> = { refereeId: current.refereeId, refereeName: current.refereeName }
        const ref = state.referees.find((r: Referee) => r.id === refereeId)
        const next: Partial<Match> = { refereeId, refereeName: ref?.name, updatedAt: new Date().toISOString() }
        set((s: MatchStoreState) => ({
          matches: s.matches.map((m: Match) => m.id === matchId ? { ...m, ...next } : m),
          pending: { ...s.pending, [matchId]: { prev, next } },
          inFlight: { ...s.inFlight, [matchId]: true },
        }))
        try {
          const updated = await api.assignReferee(matchId, refereeId)
          ;(get() as MatchStoreState).reconcileFromWS(updated as Match)
        } catch (e) {
          set((s: MatchStoreState) => ({
            matches: s.matches.map((m: Match) => m.id === matchId ? { ...m, ...prev } : m),
          }))
          throw e
        } finally {
          set((s: MatchStoreState) => ({
            pending: { ...s.pending, [matchId]: undefined },
            inFlight: { ...s.inFlight, [matchId]: false },
          }))
        }
      },

      async startMatch(matchId: string) {
        const state = get() as MatchStoreState
        if (state.inFlight[matchId]) return
        const prev = state.matches.find((m: Match) => m.id === matchId)
        if (!prev) return
        const optimistic: Partial<Match> = { status: 'active', startTime: prev.startTime ?? new Date().toISOString(), updatedAt: new Date().toISOString() }
        set((s: MatchStoreState) => ({
          matches: s.matches.map((m: Match) => m.id === matchId ? { ...m, ...optimistic } : m),
          pending: { ...s.pending, [matchId]: { prev, next: optimistic } },
          inFlight: { ...s.inFlight, [matchId]: true },
        }))
        try {
          const updated = await api.startMatch(matchId)
          ;(get() as MatchStoreState).reconcileFromWS(updated as Match)
        } catch (e) {
          set((s: MatchStoreState) => ({ matches: s.matches.map((m: Match) => m.id === matchId ? (prev as Match) : m) }))
          throw e
        } finally {
          set((s: MatchStoreState) => ({ pending: { ...s.pending, [matchId]: undefined }, inFlight: { ...s.inFlight, [matchId]: false } }))
        }
      },

      async pauseMatch(matchId: string) {
        const state = get() as MatchStoreState
        if (state.inFlight[matchId]) return
        const prev = state.matches.find((m: Match) => m.id === matchId)
        if (!prev) return
        const optimistic: Partial<Match> = { status: 'waiting', updatedAt: new Date().toISOString() }
        set((s: MatchStoreState) => ({
          matches: s.matches.map((m: Match) => m.id === matchId ? { ...m, ...optimistic } : m),
          pending: { ...s.pending, [matchId]: { prev, next: optimistic } },
          inFlight: { ...s.inFlight, [matchId]: true },
        }))
        try {
          const updated = await api.pauseMatch(matchId)
          ;(get() as MatchStoreState).reconcileFromWS(updated as Match)
        } catch (e) {
          set((s: MatchStoreState) => ({ matches: s.matches.map((m: Match) => m.id === matchId ? (prev as Match) : m) }))
          throw e
        } finally {
          set((s: MatchStoreState) => ({ pending: { ...s.pending, [matchId]: undefined }, inFlight: { ...s.inFlight, [matchId]: false } }))
        }
      },

      async endMatch(matchId: string) {
        const state = get() as MatchStoreState
        if (state.inFlight[matchId]) return
        const prev = state.matches.find((m: Match) => m.id === matchId)
        if (!prev) return
        const optimistic: Partial<Match> = { status: 'completed', endTime: new Date().toISOString(), updatedAt: new Date().toISOString() }
        set((s: MatchStoreState) => ({
          matches: s.matches.map((m: Match) => m.id === matchId ? { ...m, ...optimistic } : m),
          pending: { ...s.pending, [matchId]: { prev, next: optimistic } },
          inFlight: { ...s.inFlight, [matchId]: true },
        }))
        try {
          const updated = await api.endMatch(matchId)
          ;(get() as MatchStoreState).reconcileFromWS(updated as Match)
        } catch (e) {
          set((s: MatchStoreState) => ({ matches: s.matches.map((m: Match) => m.id === matchId ? (prev as Match) : m) }))
          throw e
        } finally {
          set((s: MatchStoreState) => ({ pending: { ...s.pending, [matchId]: undefined }, inFlight: { ...s.inFlight, [matchId]: false } }))
        }
      },

      async toggleHud(matchId: string) {
        const state = get() as MatchStoreState
        if (state.inFlight[matchId]) return
        const prev = state.matches.find((m: Match) => m.id === matchId)
        if (!prev) return
        const optimistic: Partial<Match> = { hudActive: !prev.hudActive, updatedAt: new Date().toISOString() }
        set((s: MatchStoreState) => ({
          matches: s.matches.map((m: Match) => m.id === matchId ? { ...m, ...optimistic } : m),
          pending: { ...s.pending, [matchId]: { prev, next: optimistic } },
          inFlight: { ...s.inFlight, [matchId]: true },
        }))
        try {
          const updated = await api.toggleHud(matchId)
          ;(get() as MatchStoreState).reconcileFromWS(updated as Match)
        } catch (e) {
          set((s: MatchStoreState) => ({ matches: s.matches.map((m: Match) => m.id === matchId ? (prev as Match) : m) }))
          throw e
        } finally {
          set((s: MatchStoreState) => ({ pending: { ...s.pending, [matchId]: undefined }, inFlight: { ...s.inFlight, [matchId]: false } }))
        }
      },

      reconcileFromWS: (incoming: Match) => set((state: MatchStoreState) => {
        const nextMatches = state.matches.map((m: Match) => m.id === incoming.id ? { ...m, ...incoming } : m)
        const newPending = { ...state.pending }
        delete newPending[incoming.id]
        const newInFlight = { ...state.inFlight }
        delete newInFlight[incoming.id]
        return { matches: nextMatches, pending: newPending, inFlight: newInFlight } as Partial<MatchStoreState>
      }),
    }),
    {
      name: 'match-store',
      partialize: (s: MatchStoreState) => ({ searchQuery: s.searchQuery, sortKey: s.sortKey, sortDirection: s.sortDirection })
    } as PersistOptions<MatchStoreState>
  )
)