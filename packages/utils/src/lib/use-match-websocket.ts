'use client'

import { useEffect, useRef, useState } from 'react';
import { Match, MatchState, ScoreAction, WSMessage } from './match-types';

interface UseMatchWebSocketConfig {
  matchId: string;
  onMatchUpdate?: (match: Match) => void;
  onError?: (error: Error) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}

export function useMatchWebSocket(config: UseMatchWebSocketConfig) {
  const [isConnected, setIsConnected] = useState(false);
  const [match, setMatch] = useState<Match | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const connect = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    try {
      const wsUrl = `ws://localhost:8000/ws/match/${config.matchId}`;
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        setIsConnected(true);
        setError(null);
        config.onConnect?.();
      };

      wsRef.current.onmessage = (event: MessageEvent) => {
        try {
          const message: WSMessage = JSON.parse(event.data);
          handleMessage(message);
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      wsRef.current.onclose = () => {
        setIsConnected(false);
        config.onDisconnect?.();
        
        // Attempt to reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      };

      wsRef.current.onerror = (error: Event) => {
        setError(new Error('WebSocket connection error'));
        config.onError?.(new Error('WebSocket connection error'));
      };
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Failed to connect'));
      config.onError?.(err instanceof Error ? err : new Error('Failed to connect'));
    }
  };

  const handleMessage = (message: WSMessage) => {
    switch (message.type) {
      case 'match_update':
        const updatedMatch = message.data as Match;
        setMatch(updatedMatch);
        config.onMatchUpdate?.(updatedMatch);
        break;
      case 'score_update':
        // Handle score updates
        break;
      case 'timer_update':
        // Handle timer updates
        break;
      case 'state_change':
        // Handle state changes
        break;
      default:
        console.warn('Unknown message type:', message.type);
    }
  };

  const sendMessage = (message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('WebSocket is not connected');
    }
  };

  const updateMatchState = (newState: MatchState) => {
    sendMessage({
      type: 'state_change',
      matchId: config.matchId,
      data: { state: newState },
      timestamp: new Date().toISOString(),
    });
  };

  const updateScore = (action: ScoreAction) => {
    sendMessage({
      type: 'score_update',
      matchId: config.matchId,
      data: { action },
      timestamp: new Date().toISOString(),
    });
  };

  const disconnect = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setIsConnected(false);
  };

  useEffect(() => {
    connect();
    return disconnect;
  }, [config.matchId]);

  return {
    isConnected,
    match,
    error,
    updateMatchState,
    updateScore,
    sendMessage,
    disconnect,
  };
}

// Alias for backwards compatibility
export const useMatchHUD = useMatchWebSocket;
export const useMatchWebSocketHook = useMatchWebSocket; 