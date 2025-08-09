'use client'

import { useEffect, useState } from 'react'
import { startDemoTicker, stopDemoTicker, type DemoMatch } from './mocks'

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error'

interface UseTournamentWebSocketProps {
  tournamentId: string
  onMatchUpdate: (match: DemoMatch) => void
  onRefereeUpdate: (ref: any) => void
}

export function useMatchWebSocket({ tournamentId, onMatchUpdate }: UseTournamentWebSocketProps) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected')

  useEffect(() => {
    if (!tournamentId) {
      setConnectionStatus('disconnected')
      return
    }
    setConnectionStatus('connected')
    startDemoTicker(tournamentId, (m) => onMatchUpdate(m))
    return () => {
      stopDemoTicker()
      setConnectionStatus('disconnected')
    }
  }, [tournamentId, onMatchUpdate])

  return {
    connectionStatus,
    sendMessage: () => true,
    connect: () => {},
    disconnect: () => { stopDemoTicker(); setConnectionStatus('disconnected') },
  }
}