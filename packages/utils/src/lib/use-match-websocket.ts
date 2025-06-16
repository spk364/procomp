'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { 
  Match, 
  ScoreAction, 
  WebSocketMessage, 
  WebSocketMessageSchema,
  ScoreUpdateSchema,
  MatchState,
  applyScoreAction
} from './match-types'

interface UseMatchWebSocketOptions {
  matchId: string
  isReferee?: boolean
  onMatchUpdate?: (match: Match) => void
  onError?: (error: Error) => void
  autoReconnect?: boolean
  maxReconnectAttempts?: number
}

interface WebSocketState {
  isConnected: boolean
  isConnecting: boolean
  error: string | null
  clientCount: number
  reconnectAttempts: number
}

export const useMatchWebSocket = ({
  matchId,
  isReferee = false,
  onMatchUpdate,
  onError,
  autoReconnect = true,
  maxReconnectAttempts = 5
}: UseMatchWebSocketOptions) => {
  const [match, setMatch] = useState<Match | null>(null)
  const [socketState, setSocketState] = useState<WebSocketState>({
    isConnected: false,
    isConnecting: false,
    error: null,
    clientCount: 0,
    reconnectAttempts: 0
  })

  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const heartbeatRef = useRef<NodeJS.Timeout | null>(null)

  // WebSocket URL with auth token if referee
  const getWebSocketUrl = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = process.env.NODE_ENV === 'production' 
      ? process.env.NEXT_PUBLIC_API_URL?.replace('http', 'ws') 
      : 'ws://localhost:8000'
    
    return `${host}/ws/match/${matchId}${isReferee ? '?role=referee' : ''}`
  }, [matchId, isReferee])

  // Send heartbeat to keep connection alive
  const sendHeartbeat = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'PING' }))
    }
  }, [])

  // Handle incoming WebSocket messages
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const rawMessage = JSON.parse(event.data)
      
      // Handle heartbeat response
      if (rawMessage.type === 'PONG') {
        return
      }

      // Validate message with Zod
      const message = WebSocketMessageSchema.parse(rawMessage)

      switch (message.type) {
        case 'MATCH_UPDATE':
          const updatedMatch = message.data as Match
          setMatch(updatedMatch)
          onMatchUpdate?.(updatedMatch)
          break

        case 'TIMER_UPDATE':
          const timerData = message.data as { timeRemaining: number }
          setMatch(prev => prev ? { ...prev, timeRemaining: timerData.timeRemaining } : null)
          break

        case 'CONNECTION_STATUS':
          const statusData = message.data as { connected: boolean, clientCount: number }
          setSocketState(prev => ({ ...prev, clientCount: statusData.clientCount }))
          break

        default:
          console.warn('Unknown message type:', message.type)
      }
    } catch (error) {
      console.error('Failed to parse WebSocket message:', error)
      onError?.(error as Error)
    }
  }, [onMatchUpdate, onError])

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.CONNECTING || 
        wsRef.current?.readyState === WebSocket.OPEN) {
      return
    }

    setSocketState(prev => ({ ...prev, isConnecting: true, error: null }))

    try {
      const ws = new WebSocket(getWebSocketUrl())
      wsRef.current = ws

      ws.onopen = () => {
        console.log('WebSocket connected to match:', matchId)
        setSocketState(prev => ({ 
          ...prev, 
          isConnected: true, 
          isConnecting: false, 
          error: null,
          reconnectAttempts: 0
        }))

        // Start heartbeat
        heartbeatRef.current = setInterval(sendHeartbeat, 30000)
      }

      ws.onmessage = handleMessage

      ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason)
        setSocketState(prev => ({ 
          ...prev, 
          isConnected: false, 
          isConnecting: false 
        }))

        // Clear heartbeat
        if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current)
          heartbeatRef.current = null
        }

        // Auto-reconnect logic
        if (autoReconnect && 
            socketState.reconnectAttempts < maxReconnectAttempts &&
            event.code !== 1000) { // 1000 = normal closure
          
          const delay = Math.min(1000 * Math.pow(2, socketState.reconnectAttempts), 30000)
          console.log(`Reconnecting in ${delay}ms... (attempt ${socketState.reconnectAttempts + 1})`)
          
          reconnectTimeoutRef.current = setTimeout(() => {
            setSocketState(prev => ({ 
              ...prev, 
              reconnectAttempts: prev.reconnectAttempts + 1 
            }))
            connect()
          }, delay)
        }
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        const wsError = new Error('WebSocket connection failed')
        setSocketState(prev => ({ ...prev, error: wsError.message, isConnecting: false }))
        onError?.(wsError)
      }

    } catch (error) {
      console.error('Failed to create WebSocket:', error)
      const connectionError = new Error('Failed to create WebSocket connection')
      setSocketState(prev => ({ ...prev, error: connectionError.message, isConnecting: false }))
      onError?.(connectionError)
    }
  }, [
    matchId, 
    getWebSocketUrl, 
    handleMessage, 
    sendHeartbeat, 
    autoReconnect, 
    maxReconnectAttempts, 
    socketState.reconnectAttempts,
    onError
  ])

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }

    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current)
      heartbeatRef.current = null
    }

    if (wsRef.current) {
      wsRef.current.close(1000, 'User disconnect')
      wsRef.current = null
    }

    setSocketState(prev => ({ 
      ...prev, 
      isConnected: false, 
      isConnecting: false,
      reconnectAttempts: 0
    }))
  }, [])

  // Send score update (referee only)
  const sendScoreUpdate = useCallback((action: ScoreAction, participantId: string) => {
    if (!isReferee) {
      throw new Error('Only referees can send score updates')
    }

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected')
    }

    try {
      const scoreUpdate = ScoreUpdateSchema.parse({
        action,
        participantId,
        timestamp: new Date().toISOString()
      })

      const message: WebSocketMessage = {
        type: 'SCORE_UPDATE',
        matchId,
        data: scoreUpdate,
        timestamp: new Date().toISOString()
      }

      wsRef.current.send(JSON.stringify(message))

      // Optimistically update local state
      setMatch(prev => {
        if (!prev) return null

        const isParticipant1 = participantId === prev.participant1.id
        const currentScore = isParticipant1 ? prev.score1 : prev.score2
        const newScore = applyScoreAction(currentScore, action)

        return {
          ...prev,
          [isParticipant1 ? 'score1' : 'score2']: newScore,
          updatedAt: new Date().toISOString()
        }
      })

    } catch (error) {
      console.error('Failed to send score update:', error)
      onError?.(error as Error)
      throw error
    }
  }, [isReferee, matchId, onError])

  // Send match state update (referee only)
  const sendMatchStateUpdate = useCallback((newState: MatchState) => {
    if (!isReferee) {
      throw new Error('Only referees can update match state')
    }

    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      throw new Error('WebSocket is not connected')
    }

    try {
      const message = {
        type: 'MATCH_STATE_UPDATE',
        matchId,
        data: { state: newState },
        timestamp: new Date().toISOString()
      }

      wsRef.current.send(JSON.stringify(message))

      // Optimistically update local state
      setMatch(prev => prev ? { ...prev, state: newState } : null)

    } catch (error) {
      console.error('Failed to send match state update:', error)
      onError?.(error as Error)
      throw error
    }
  }, [isReferee, matchId, onError])

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    connect()
    return disconnect
  }, [connect, disconnect])

  return {
    match,
    socketState,
    connect,
    disconnect,
    sendScoreUpdate,
    sendMatchStateUpdate,
    isReferee
  }
}

// Simplified hook for HUD consumers (read-only)
export const useMatchHUD = (matchId: string) => {
  return useMatchWebSocket({
    matchId,
    isReferee: false,
    autoReconnect: true,
    maxReconnectAttempts: 10
  })
} 