'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { Match, Referee } from '../page';

interface UseMatchWebSocketProps {
  tournamentId: string;
  onMatchUpdate: (match: Match) => void;
  onRefereeUpdate: (referee: Referee) => void;
}

interface WebSocketMessage {
  type: 'match_update' | 'referee_update' | 'match_status_change' | 'hud_status_change';
  data: any;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export function useMatchWebSocket({
  tournamentId,
  onMatchUpdate,
  onRefereeUpdate,
}: UseMatchWebSocketProps) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 5;
  const reconnectDelay = 3000;

  const connect = useCallback(() => {
    if (!tournamentId) return;

    try {
      setConnectionStatus('connecting');
      
      // WebSocket URL - adjust based on your backend setup
      const wsUrl = process.env.NODE_ENV === 'production' 
        ? `wss://${window.location.host}/api/ws/tournament/${tournamentId}`
        : `ws://localhost:3001/api/ws/tournament/${tournamentId}`;

      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log(`WebSocket connected to tournament ${tournamentId}`);
        setConnectionStatus('connected');
        reconnectAttempts.current = 0;

        // Send initial subscription message
        ws.send(JSON.stringify({
          type: 'subscribe',
          tournamentId,
        }));
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);
          
          switch (message.type) {
            case 'match_update':
            case 'match_status_change':
              onMatchUpdate(message.data);
              break;
            case 'referee_update':
              onRefereeUpdate(message.data);
              break;
            case 'hud_status_change':
              // Update match with new HUD status
              onMatchUpdate({
                ...message.data.match,
                hudActive: message.data.hudActive,
              });
              break;
            default:
              console.log('Unknown WebSocket message type:', message.type);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onclose = (event) => {
        console.log('WebSocket connection closed:', event.code, event.reason);
        setConnectionStatus('disconnected');
        wsRef.current = null;

        // Attempt to reconnect if not a manual close
        if (event.code !== 1000 && reconnectAttempts.current < maxReconnectAttempts) {
          reconnectAttempts.current++;
          console.log(`Attempting to reconnect (${reconnectAttempts.current}/${maxReconnectAttempts})...`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectDelay * Math.pow(1.5, reconnectAttempts.current - 1)); // Exponential backoff
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnectionStatus('error');
      };

    } catch (error) {
      console.error('Failed to establish WebSocket connection:', error);
      setConnectionStatus('error');
    }
  }, [tournamentId, onMatchUpdate, onRefereeUpdate]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close(1000, 'Manual disconnect');
      wsRef.current = null;
    }

    setConnectionStatus('disconnected');
    reconnectAttempts.current = 0;
  }, []);

  const sendMessage = useCallback((message: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
      return true;
    }
    return false;
  }, []);

  // Connect when tournament changes
  useEffect(() => {
    if (tournamentId) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [tournamentId, connect, disconnect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  // Ping to keep connection alive
  useEffect(() => {
    if (connectionStatus === 'connected' && wsRef.current) {
      const pingInterval = setInterval(() => {
        sendMessage({ type: 'ping' });
      }, 30000); // Send ping every 30 seconds

      return () => clearInterval(pingInterval);
    }
  }, [connectionStatus, sendMessage]);

  return {
    connectionStatus,
    sendMessage,
    connect,
    disconnect,
  };
} 