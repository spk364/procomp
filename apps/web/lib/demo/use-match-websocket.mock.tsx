'use client'

import { useEffect, useRef, useState } from 'react'
import { Match, MatchState, Score, ScoreAction } from '@procomp/utils'

function nowIso() { return new Date().toISOString() }

function createDemoMatch(matchId: string): Match {
  return {
    id: matchId,
    tournamentId: 't-1',
    participant1: { id: 'p1', name: 'John Doe', club: 'Team A', weight: 75, team: 'Blue', belt: 'Brown' },
    participant2: { id: 'p2', name: 'Mark Smith', club: 'Team B', weight: 77, team: 'Red', belt: 'Purple' },
    score1: { points: 0, advantages: 0, penalties: 0, submissions: 0 },
    score2: { points: 0, advantages: 0, penalties: 0, submissions: 0 },
    duration: 6 * 60,
    timeRemaining: 6 * 60,
    state: MatchState.SCHEDULED,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
}

export function useMatchWebSocket({
  matchId,
  onMatchUpdate,
  onError,
  onConnect,
  onDisconnect,
}: {
  matchId: string
  onMatchUpdate?: (match: Match) => void
  onError?: (error: Error) => void
  onConnect?: () => void
  onDisconnect?: () => void
}) {
  const [isConnected, setIsConnected] = useState(false)
  const [match, setMatch] = useState<Match | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    try {
      setIsConnected(true)
      const initial = createDemoMatch(matchId)
      setMatch(initial)
      onConnect?.()
      onMatchUpdate?.(initial)

      timerRef.current = setInterval(() => {
        setMatch(prev => {
          if (!prev) return prev
          const next: Match = { ...prev, updatedAt: nowIso() }
          if (next.state === MatchState.IN_PROGRESS && next.timeRemaining > 0) {
            next.timeRemaining = Math.max(0, next.timeRemaining - 1)
            if (Math.random() < 0.15) next.score1 = addRandomScore(next.score1)
            if (Math.random() < 0.15) next.score2 = addRandomScore(next.score2)
            if (next.timeRemaining === 0) next.state = MatchState.FINISHED
          }
          onMatchUpdate?.(next)
          return next
        })
      }, 1000)
    } catch (e) {
      const err = e instanceof Error ? e : new Error('Demo connection failed')
      setError(err)
      onError?.(err)
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
      timerRef.current = null
      setIsConnected(false)
      onDisconnect?.()
    }
  }, [matchId])

  function addRandomScore(score: Score): Score {
    const r = Math.random()
    if (r < 0.5) return { ...score, points: score.points + 2 }
    if (r < 0.7) return { ...score, advantages: score.advantages + 1 }
    if (r < 0.9) return { ...score, penalties: score.penalties + 1 }
    return { ...score, submissions: score.submissions + 1 }
  }

  const sendMessage = (_msg: any) => true

  const disconnect = () => {
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = null
    setIsConnected(false)
    onDisconnect?.()
  }

  const updateMatchState = (newState: MatchState) => {
    setMatch(prev => {
      if (!prev) return prev
      const next = { ...prev, state: newState, updatedAt: nowIso() }
      return next
    })
  }

  const updateScore = (action: ScoreAction) => {
    setMatch(prev => {
      if (!prev) return prev
      const next = { ...prev }
      if (action === ScoreAction.POINTS_2) next.score1 = { ...next.score1, points: next.score1.points + 2 }
      else if (action === ScoreAction.ADVANTAGE) next.score1 = { ...next.score1, advantages: next.score1.advantages + 1 }
      else if (action === ScoreAction.PENALTY) next.score1 = { ...next.score1, penalties: next.score1.penalties + 1 }
      else if (action === ScoreAction.SUBMISSION) next.score1 = { ...next.score1, submissions: next.score1.submissions + 1 }
      next.updatedAt = nowIso()
      return next
    })
  }

  return { isConnected, match, error, updateMatchState, updateScore, sendMessage, disconnect }
}