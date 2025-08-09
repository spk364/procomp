'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Match, Referee } from '../page'
import { api } from '../../../lib/api-client'

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

  getVisibleMatches: () => Match[]

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
  persist(
    (set, get) => ({
      matches: [],
      referees: [],
      searchQuery: '',
      sortKey: 'updatedAt',
      sortDirection: 'desc',
      pending: {},
      inFlight: {},

      setMatches: (matches) => set({ matches }),
      upsertMatch: (match) => set(state => ({
        matches: state.matches.some(m => m.id === match.id)
          ? state.matches.map(m => (m.id === match.id ? match : m))
          : [match, ...state.matches],
      })),
      setReferees: (refs) => set({ referees: refs }),
      upsertReferee: (ref) => set(state => ({
        referees: state.referees.some(r => r.id === ref.id)
          ? state.referees.map(r => (r.id === ref.id ? ref : r))
          : [ref, ...state.referees],
      })),

      setSearchQuery: (q) => set({ searchQuery: q }),
      setSort: (key) => set(state => ({
        sortKey: key,
        sortDirection: state.sortKey === key && state.sortDirection === 'asc' ? 'desc' : 'asc',
      })),

      getVisibleMatches: () => {
        const { matches, searchQuery, sortKey, sortDirection } = get()
        const q = normalize(searchQuery)
        const filtered = q
          ? matches.filter(m =>
              normalize(m.category).includes(q) ||
              normalize(m.division).includes(q) ||
              normalize(m.athlete1Name).includes(q) ||
              normalize(m.athlete2Name).includes(q) ||
              normalize(m.refereeName).includes(q) ||
              String(m.matNumber || '').includes(q)
            )
          : matches
        return sortMatches(filtered, sortKey, sortDirection)
      },

      async assignReferee(matchId, refereeId) {
        const state = get()
        if (state.inFlight[matchId]) return
        const current = state.matches.find(m => m.id === matchId)
        if (!current) return
        const prev: Partial<Match> = { refereeId: current.refereeId, refereeName: current.refereeName }
        const ref = state.referees.find(r => r.id === refereeId)
        const next: Partial<Match> = { refereeId, refereeName: ref?.name, updatedAt: new Date().toISOString() }
        set(s => ({
          matches: s.matches.map(m => m.id === matchId ? { ...m, ...next } : m),
          pending: { ...s.pending, [matchId]: { prev, next } },
          inFlight: { ...s.inFlight, [matchId]: true },
        }))
        try {
          const updated = await api.assignReferee(matchId, refereeId)
          get().reconcileFromWS(updated as Match)
        } catch (e) {
          // rollback
          set(s => ({
            matches: s.matches.map(m => m.id === matchId ? { ...m, ...prev } : m),
          }))
          throw e
        } finally {
          set(s => ({
            pending: { ...s.pending, [matchId]: undefined },
            inFlight: { ...s.inFlight, [matchId]: false },
          }))
        }
      },

      async startMatch(matchId) {
        const state = get()
        if (state.inFlight[matchId]) return
        const prev = state.matches.find(m => m.id === matchId)
        if (!prev) return
        const optimistic: Partial<Match> = { status: 'active', startTime: prev.startTime ?? new Date().toISOString(), updatedAt: new Date().toISOString() }
        set(s => ({
          matches: s.matches.map(m => m.id === matchId ? { ...m, ...optimistic } : m),
          pending: { ...s.pending, [matchId]: { prev, next: optimistic } },
          inFlight: { ...s.inFlight, [matchId]: true },
        }))
        try {
          const updated = await api.startMatch(matchId)
          get().reconcileFromWS(updated as Match)
        } catch (e) {
          set(s => ({ matches: s.matches.map(m => m.id === matchId ? (prev as Match) : m) }))
          throw e
        } finally {
          set(s => ({ pending: { ...s.pending, [matchId]: undefined }, inFlight: { ...s.inFlight, [matchId]: false } }))
        }
      },

      async pauseMatch(matchId) {
        const state = get()
        if (state.inFlight[matchId]) return
        const prev = state.matches.find(m => m.id === matchId)
        if (!prev) return
        const optimistic: Partial<Match> = { status: 'waiting', updatedAt: new Date().toISOString() }
        set(s => ({
          matches: s.matches.map(m => m.id === matchId ? { ...m, ...optimistic } : m),
          pending: { ...s.pending, [matchId]: { prev, next: optimistic } },
          inFlight: { ...s.inFlight, [matchId]: true },
        }))
        try {
          const updated = await api.pauseMatch(matchId)
          get().reconcileFromWS(updated as Match)
        } catch (e) {
          set(s => ({ matches: s.matches.map(m => m.id === matchId ? (prev as Match) : m) }))
          throw e
        } finally {
          set(s => ({ pending: { ...s.pending, [matchId]: undefined }, inFlight: { ...s.inFlight, [matchId]: false } }))
        }
      },

      async endMatch(matchId) {
        const state = get()
        if (state.inFlight[matchId]) return
        const prev = state.matches.find(m => m.id === matchId)
        if (!prev) return
        const optimistic: Partial<Match> = { status: 'completed', endTime: new Date().toISOString(), updatedAt: new Date().toISOString() }
        set(s => ({
          matches: s.matches.map(m => m.id === matchId ? { ...m, ...optimistic } : m),
          pending: { ...s.pending, [matchId]: { prev, next: optimistic } },
          inFlight: { ...s.inFlight, [matchId]: true },
        }))
        try {
          const updated = await api.endMatch(matchId)
          get().reconcileFromWS(updated as Match)
        } catch (e) {
          set(s => ({ matches: s.matches.map(m => m.id === matchId ? (prev as Match) : m) }))
          throw e
        } finally {
          set(s => ({ pending: { ...s.pending, [matchId]: undefined }, inFlight: { ...s.inFlight, [matchId]: false } }))
        }
      },

      async toggleHud(matchId) {
        const state = get()
        if (state.inFlight[matchId]) return
        const prev = state.matches.find(m => m.id === matchId)
        if (!prev) return
        const optimistic: Partial<Match> = { hudActive: !prev.hudActive, updatedAt: new Date().toISOString() }
        set(s => ({
          matches: s.matches.map(m => m.id === matchId ? { ...m, ...optimistic } : m),
          pending: { ...s.pending, [matchId]: { prev, next: optimistic } },
          inFlight: { ...s.inFlight, [matchId]: true },
        }))
        try {
          const updated = await api.toggleHud(matchId)
          get().reconcileFromWS(updated as Match)
        } catch (e) {
          set(s => ({ matches: s.matches.map(m => m.id === matchId ? (prev as Match) : m) }))
          throw e
        } finally {
          set(s => ({ pending: { ...s.pending, [matchId]: undefined }, inFlight: { ...s.inFlight, [matchId]: false } }))
        }
      },

      reconcileFromWS: (incoming) => set(state => {
        // If we had a pending change, prefer server truth and clear pending
        const nextMatches = state.matches.map(m => m.id === incoming.id ? { ...m, ...incoming } : m)
        const newPending = { ...state.pending }
        delete newPending[incoming.id]
        const newInFlight = { ...state.inFlight }
        delete newInFlight[incoming.id]
        return { matches: nextMatches, pending: newPending, inFlight: newInFlight }
      }),
    }),
    {
      name: 'match-store',
      partialize: (s) => ({ searchQuery: s.searchQuery, sortKey: s.sortKey, sortDirection: s.sortDirection })
    }
  )
)