'use client'

import { useParams } from 'next/navigation'
import { useMatchHUD } from '@procomp/utils/lib/use-match-websocket'
import { MatchState } from '@procomp/utils/lib/match-types'

// Minimal timer component for HUD
const HUDTimer = ({ timeRemaining, state }: { 
  timeRemaining: number
  state: MatchState 
}) => {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const getStateColor = (state: MatchState) => {
    switch (state) {
      case MatchState.IN_PROGRESS: return 'text-green-400'
      case MatchState.PAUSED: return 'text-yellow-400'
      case MatchState.FINISHED: return 'text-red-400'
      default: return 'text-gray-400'
    }
  }

  return (
    <div className="text-center">
      <div className="text-6xl font-mono font-bold text-white mb-2">
        {formatTime(timeRemaining)}
      </div>
      <div className={`text-lg font-medium ${getStateColor(state)}`}>
        {state.replace('_', ' ')}
      </div>
    </div>
  )
}

// Participant score component for HUD
const HUDParticipant = ({ 
  name, 
  team, 
  score, 
  isWinner,
  position 
}: {
  name: string
  team?: string
  score: {
    points: number
    advantages: number
    penalties: number
    submissions: number
  }
  isWinner: boolean
  position: 'left' | 'right'
}) => {
  return (
    <div className={`${position === 'left' ? 'text-left' : 'text-right'} ${isWinner ? 'ring-2 ring-yellow-400' : ''} 
                     bg-black/80 backdrop-blur-sm rounded-lg p-4 border border-gray-700`}>
      {/* Participant Info */}
      <div className={`mb-3 ${position === 'right' ? 'text-right' : 'text-left'}`}>
        <h2 className="text-2xl font-bold text-white truncate">{name}</h2>
        {team && (
          <p className="text-sm text-gray-300 truncate">{team}</p>
        )}
        {isWinner && (
          <div className="text-yellow-400 text-sm font-medium mt-1">WINNER</div>
        )}
      </div>

      {/* Score Grid */}
      <div className="grid grid-cols-2 gap-3 text-center">
        <div className="bg-gray-800/60 rounded p-2">
          <div className="text-3xl font-bold text-blue-400">{score.points}</div>
          <div className="text-xs text-gray-400">PTS</div>
        </div>
        <div className="bg-gray-800/60 rounded p-2">
          <div className="text-2xl font-bold text-green-400">{score.advantages}</div>
          <div className="text-xs text-gray-400">ADV</div>
        </div>
        <div className="bg-gray-800/60 rounded p-2">
          <div className="text-2xl font-bold text-red-400">{score.penalties}</div>
          <div className="text-xs text-gray-400">PEN</div>
        </div>
        <div className="bg-gray-800/60 rounded p-2">
          <div className="text-2xl font-bold text-purple-400">{score.submissions}</div>
          <div className="text-xs text-gray-400">SUB</div>
        </div>
      </div>
    </div>
  )
}

// Connection indicator
const ConnectionIndicator = ({ isConnected }: { isConnected: boolean }) => {
  return (
    <div className="absolute top-4 right-4 z-50">
      <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-400' : 'bg-red-400'} 
                      ${isConnected ? 'animate-pulse' : 'animate-ping'}`} />
    </div>
  )
}

// Main HUD component
export default function HUDPage() {
  const params = useParams()
  const matchId = params.matchId as string

  const { match, socketState } = useMatchHUD(matchId)

  // Determine winner
  const getWinner = () => {
    if (!match) return null
    
    const { score1, score2 } = match
    
    // Check for submission wins
    if (score1.submissions > 0) return match.participant1.id
    if (score2.submissions > 0) return match.participant2.id
    
    // Check for disqualification (3+ penalties)
    if (score1.penalties >= 3) return match.participant2.id
    if (score2.penalties >= 3) return match.participant1.id
    
    // Points comparison
    if (score1.points > score2.points) return match.participant1.id
    if (score2.points > score1.points) return match.participant2.id
    
    // Advantages comparison
    if (score1.advantages > score2.advantages) return match.participant1.id
    if (score2.advantages > score1.advantages) return match.participant2.id
    
    // Penalties comparison (fewer penalties wins)
    if (score1.penalties < score2.penalties) return match.participant1.id
    if (score2.penalties < score1.penalties) return match.participant2.id
    
    return null // Draw
  }

  const winner = getWinner()

  if (!match) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-16 w-16 border-4 border-white border-t-transparent mx-auto" />
          <p className="text-white text-xl">Loading Match...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_25%,_white_1px,_transparent_1px)] bg-[length:50px_50px]" />
      </div>

      {/* Connection Indicator */}
      <ConnectionIndicator isConnected={socketState.isConnected} />

      {/* Main Content */}
      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header */}
        <div className="text-center py-6 bg-black/20 backdrop-blur-sm border-b border-gray-700">
          <h1 className="text-2xl font-bold text-white mb-2">
            {match.category}
          </h1>
          <p className="text-gray-300">{match.division}</p>
        </div>

        {/* Main Match Display */}
        <div className="flex-1 flex flex-col justify-center px-8 py-12">
          {/* Timer */}
          <div className="mb-12">
            <HUDTimer 
              timeRemaining={match.timeRemaining}
              state={match.state}
            />
          </div>

          {/* VS Display */}
          <div className="text-center mb-8">
            <div className="text-4xl font-bold text-gray-400">VS</div>
          </div>

          {/* Participants */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            <HUDParticipant
              name={match.participant1.name}
              team={match.participant1.team}
              score={match.score1}
              isWinner={winner === match.participant1.id}
              position="left"
            />
            
            <HUDParticipant
              name={match.participant2.name}
              team={match.participant2.team}
              score={match.score2}
              isWinner={winner === match.participant2.id}
              position="right"
            />
          </div>

          {/* Match Finished Banner */}
          {match.state === MatchState.FINISHED && (
            <div className="mt-8 text-center">
              <div className="inline-block bg-gradient-to-r from-red-500 to-orange-500 text-white 
                              text-2xl font-bold px-8 py-4 rounded-lg shadow-lg animate-pulse">
                MATCH FINISHED
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="text-center py-4 bg-black/20 backdrop-blur-sm border-t border-gray-700">
          <p className="text-gray-400 text-sm">
            Live Tournament Feed • {socketState.clientCount} viewers
          </p>
        </div>
      </div>

      {/* Disconnection Overlay */}
      {!socketState.isConnected && (
        <div className="absolute inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-red-900/90 border border-red-700 rounded-lg p-6 text-center">
            <div className="text-red-400 text-xl font-bold mb-2">Connection Lost</div>
            <div className="text-red-200">Attempting to reconnect...</div>
            <div className="mt-4">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-red-400 border-t-transparent mx-auto" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Additional CSS for smoother animations (could be added to globals.css)
export const hudStyles = `
  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .animate-fadeInUp {
    animation: fadeInUp 0.5s ease-out;
  }

  @keyframes glow {
    0%, 100% {
      box-shadow: 0 0 5px rgba(255, 255, 255, 0.5);
    }
    50% {
      box-shadow: 0 0 20px rgba(255, 255, 255, 0.8);
    }
  }

  .animate-glow {
    animation: glow 2s ease-in-out infinite;
  }
` 