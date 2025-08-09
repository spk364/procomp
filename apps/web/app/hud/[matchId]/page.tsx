'use client'

import { useParams } from 'next/navigation'
import { Badge } from '@procomp/ui'
import { MatchState, useMatchHUD } from '@procomp/utils'

const HUDTimer = ({ timeRemaining, state }: { 
  timeRemaining: number
  state: typeof MatchState[keyof typeof MatchState]
}) => {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const getStateColor = (state: typeof MatchState[keyof typeof MatchState]) => {
    switch (state) {
      case MatchState.IN_PROGRESS: return 'text-green-400'
      case MatchState.PAUSED: return 'text-yellow-400'
      case MatchState.FINISHED: return 'text-red-400'
      default: return 'text-gray-400'
    }
  }

  return (
    <div className="text-center">
      <div className="text-8xl font-mono font-bold text-white mb-2">
        {formatTime(timeRemaining)}
      </div>
      <Badge 
        variant="outline" 
        className={`text-lg px-4 py-2 ${getStateColor(state)}`}
      >
        {state.replace('_', ' ').toUpperCase()}
      </Badge>
    </div>
  )
}

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
  const bgColor = isWinner ? 'bg-yellow-500/20 border-yellow-500' : 'bg-gray-800/50 border-gray-600'
  const textAlign = position === 'left' ? 'text-left' : 'text-right'

  return (
    <div className={`p-6 rounded-lg border-2 ${bgColor} backdrop-blur-sm`}>
      <div className={`${textAlign} mb-4`}>
        <h2 className="text-2xl font-bold text-white">{name}</h2>
        {team && <p className="text-gray-300">{team}</p>}
        {isWinner && <span className="text-yellow-400 text-lg">🏆 WINNER</span>}
      </div>
      
      <div className="grid grid-cols-2 gap-4">
        <div className="text-center">
          <div className="text-4xl font-bold text-white">{score.points}</div>
          <div className="text-sm text-gray-400">Points</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold text-blue-400">{score.advantages}</div>
          <div className="text-sm text-gray-400">Advantages</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold text-red-400">{score.penalties}</div>
          <div className="text-sm text-gray-400">Penalties</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold text-green-400">{score.submissions}</div>
          <div className="text-sm text-gray-400">Submissions</div>
        </div>
      </div>
    </div>
  )
}

const ConnectionIndicator = ({ isConnected }: { isConnected: boolean }) => {
  return (
    <div className="absolute top-4 right-4 flex items-center space-x-2">
      <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'} 
                      ${isConnected ? 'animate-pulse' : 'animate-ping'}`} />
    </div>
  )
}

// Main HUD component
export default function HUDPage() {
  const params = useParams()
  const matchId = params.matchId as string

  const { match, isConnected } = useMatchHUD({
    matchId,
    onMatchUpdate: (updatedMatch: any) => {
      // Handle match updates if needed
    }
  })

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
        <div className="text-2xl text-white">Loading match...</div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-blue-900 to-purple-900 relative overflow-hidden">
      <ConnectionIndicator isConnected={isConnected} />
      
      <div className="absolute inset-0 bg-black/30" />
      
      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header */}
        <div className="text-center py-8">
          <h1 className="text-6xl font-bold text-white mb-4">
            MATCH HUD
          </h1>
          <p className="text-xl text-gray-300">
            Match #{match.id} • Tournament: {match.tournamentId}
          </p>
        </div>

        {/* Timer */}
        <div className="flex-1 flex items-center justify-center mb-8">
          <HUDTimer 
            timeRemaining={match.timeRemaining}
            state={match.state}
          />
        </div>

        {/* Participants */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 px-8 pb-8">
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

        {/* Winner Declaration */}
        {winner && match.state === MatchState.FINISHED && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/50">
            <div className="text-center">
              <div className="text-8xl mb-4">🏆</div>
              <div className="text-6xl font-bold text-yellow-400 mb-2">
                WINNER!
              </div>
              <div className="text-4xl text-white">
                {winner === match.participant1.id ? match.participant1.name : match.participant2.name}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
} 