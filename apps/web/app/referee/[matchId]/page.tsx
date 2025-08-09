'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@procomp/ui'
import { Badge } from '@procomp/ui'
import { Button } from '@procomp/ui'
import { useToast } from '@procomp/ui'
import { PlayIcon, PauseIcon, Square, RotateCcw } from 'lucide-react'
import { Match, MatchState, ScoreAction, getMatchWinner, useMatchWebSocket } from '@procomp/utils'

// Components
const MatchTimer = ({ timeRemaining, duration, state }: { 
  timeRemaining: number
  duration: number 
  state: typeof MatchState[keyof typeof MatchState]
}) => {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}:${secs.toString().padStart(2, '0')}`
  }

  const progressPercentage = ((duration - timeRemaining) / duration) * 100

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="text-center mb-4">
        <div className="text-6xl font-mono font-bold text-primary">
          {formatTime(timeRemaining)}
        </div>
        <div className="text-sm text-muted-foreground">
          {formatTime(duration)} total
        </div>
      </div>
      
      <div className="w-full bg-secondary rounded-full h-2">
        <div 
          className="bg-primary h-2 rounded-full transition-all duration-1000"
          style={{ width: `${progressPercentage}%` }}
        />
      </div>
      
      <div className="text-center mt-2">
        <Badge variant={state === MatchState.IN_PROGRESS ? 'default' : 'secondary'}>
          {state.replace('_', ' ').toUpperCase()}
        </Badge>
      </div>
    </div>
  )
}

const ScoreCard = ({ 
  participant, 
  score, 
  isWinner,
  onScoreAction 
}: {
  participant: Match['participant1']
  score: Match['score1']
  isWinner: boolean
  onScoreAction: (action: typeof ScoreAction[keyof typeof ScoreAction]) => void
}) => {
  return (
    <Card className={`relative ${isWinner ? 'ring-2 ring-yellow-400' : ''}`}>
      <CardHeader>
        <CardTitle className="text-lg">{participant.name}</CardTitle>
        <CardDescription>
          {participant.club} • {participant.weight}kg
        </CardDescription>
        {participant.team && (
          <p className="text-sm text-muted-foreground">{participant.team}</p>
        )}
        {participant.belt && (
          <Badge variant="outline" className="w-fit">{participant.belt}</Badge>
        )}
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="text-center">
            <div className="text-3xl font-bold text-primary">{score.points}</div>
            <div className="text-sm text-muted-foreground">Points</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-semibold text-blue-600">{score.advantages}</div>
            <div className="text-sm text-muted-foreground">Advantages</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-semibold text-red-600">{score.penalties}</div>
            <div className="text-sm text-muted-foreground">Penalties</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-semibold text-green-600">{score.submissions}</div>
            <div className="text-sm text-muted-foreground">Submissions</div>
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onScoreAction(ScoreAction.POINTS_2)}
            className="text-xs"
          >
            +2 Points
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onScoreAction(ScoreAction.ADVANTAGE)}
            className="text-xs"
          >
            +1 Advantage
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onScoreAction(ScoreAction.PENALTY)}
            className="text-xs text-red-600"
          >
            +1 Penalty
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onScoreAction(ScoreAction.SUBMISSION)}
            className="text-xs text-green-600"
          >
            Submission
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// Main component
export default function RefereePage() {
  const router = useRouter()
  const { toast } = useToast()
  const matchId = 'match-1' // TODO: Get from params
  const [isLoading, setIsLoading] = useState(true)
  const [matchWinner, setMatchWinner] = useState<string | null>(null)

  const {
    match,
    isConnected,
    error,
    updateMatchState,
    updateScore,
    disconnect
  } = useMatchWebSocket({
    matchId,
    onMatchUpdate: (updatedMatch: Match) => {
      setIsLoading(false)
      
      // Check for winner
      const winner = getMatchWinner(updatedMatch)
      setMatchWinner(winner)
      
      // Auto-end match on submission or 3+ penalties
      if (updatedMatch.state === MatchState.IN_PROGRESS) {
        const hasSubmission = updatedMatch.score1.submissions > 0 || updatedMatch.score2.submissions > 0
        const hasDisqualification = updatedMatch.score1.penalties >= 3 || updatedMatch.score2.penalties >= 3
        
        if (hasSubmission || hasDisqualification) {
          updateMatchState(MatchState.FINISHED)
        }
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Connection Error',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading match...</div>
      </div>
    )
  }

  if (!match) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Match not found</div>
      </div>
    )
  }

  const handleScoreAction = async (participantId: string, action: typeof ScoreAction[keyof typeof ScoreAction]) => {
    try {
      updateScore(action)
      
      toast({
        title: 'Score Updated',
        description: `${action.replace('_', ' ')} applied successfully`,
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update score',
        variant: 'destructive',
      })
    }
  }

  const handleMatchStateChange = async (newState: typeof MatchState[keyof typeof MatchState]) => {
    try {
      updateMatchState(newState)
      
      toast({
        title: 'Match State Updated',
        description: `Match is now ${newState.replace('_', ' ')}`,
      })
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update match state',
        variant: 'destructive',
      })
    }
  }

  const participant1IsWinner = matchWinner === match.participant1.id
  const participant2IsWinner = matchWinner === match.participant2.id

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Referee Control Panel
          </h1>
          <p className="text-lg text-gray-600">
            Match #{match.id} • Tournament: {match.tournamentId}
          </p>
          <div className="mt-2 flex justify-center gap-4">
            <Badge variant={isConnected ? 'default' : 'destructive'}>
              {isConnected ? 'Connected' : 'Disconnected'}
            </Badge>
            {error && (
              <Badge variant="destructive">
                Error: {error.message}
              </Badge>
            )}
          </div>
        </div>

        {/* Timer */}
        <div className="mb-8">
          <MatchTimer 
            timeRemaining={match.timeRemaining}
            duration={match.duration}
            state={match.state}
          />
        </div>

        {/* Match Controls */}
        <div className="flex justify-center gap-4 mb-8">
          <Button
            size="lg"
            onClick={() => handleMatchStateChange(MatchState.IN_PROGRESS)}
            disabled={match.state === MatchState.IN_PROGRESS}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            <PlayIcon className="mr-2 h-4 w-4" />
            Start Match
          </Button>
          
          <Button
            size="lg"
            variant="outline"
            onClick={() => handleMatchStateChange(MatchState.PAUSED)}
            disabled={match.state !== MatchState.IN_PROGRESS}
          >
            <PauseIcon className="mr-2 h-4 w-4" />
            Pause Match
          </Button>
          
          <Button
            size="lg"
            variant="outline"
            onClick={() => handleMatchStateChange(MatchState.FINISHED)}
            disabled={match.state === MatchState.FINISHED}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            <Square className="mr-2 h-4 w-4" />
            End Match
          </Button>
          
          <Button
            size="lg"
            variant="outline"
            onClick={() => handleMatchStateChange(MatchState.SCHEDULED)}
            className="bg-yellow-600 hover:bg-yellow-700 text-white"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset Match
          </Button>
        </div>

        {/* Score Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          <div>
            <h2 className="text-2xl font-bold text-center mb-4">
              {participant1IsWinner && '🏆 '} Participant 1
            </h2>
            <ScoreCard
              participant={match.participant1}
              score={match.score1}
              isWinner={participant1IsWinner}
              onScoreAction={(action) => handleScoreAction(match.participant1.id, action)}
            />
          </div>
          
          <div>
            <h2 className="text-2xl font-bold text-center mb-4">
              {participant2IsWinner && '🏆 '} Participant 2
            </h2>
            <ScoreCard
              participant={match.participant2}
              score={match.score2}
              isWinner={participant2IsWinner}
              onScoreAction={(action) => handleScoreAction(match.participant2.id, action)}
            />
          </div>
        </div>

        {/* Winner Declaration */}
        {matchWinner && match.state === MatchState.FINISHED && (
          <div className="text-center">
            <Card className="max-w-md mx-auto bg-yellow-50 border-yellow-200">
              <CardHeader>
                <CardTitle className="text-yellow-800">🏆 Match Winner!</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-semibold text-yellow-900">
                  {matchWinner === match.participant1.id 
                    ? match.participant1.name 
                    : match.participant2.name
                  }
                </p>
                <p className="text-sm text-yellow-700">
                  {matchWinner === match.participant1.id 
                    ? match.participant1.club 
                    : match.participant2.club
                  }
                </p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  )
} 