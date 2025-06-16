'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Play, Pause, Square, RotateCcw, Wifi, WifiOff } from 'lucide-react'
import { useToast } from '@/components/ui/use-toast'
import { useMatchWebSocket } from '@procomp/utils/lib/use-match-websocket'
import { ScoreAction, MatchState, Match } from '@procomp/utils/lib/match-types'

// Timer component
const MatchTimer = ({ timeRemaining, duration, state }: { 
  timeRemaining: number
  duration: number 
  state: MatchState 
}) => {
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  const progress = ((duration - timeRemaining) / duration) * 100

  return (
    <div className="text-center space-y-2">
      <div className="text-4xl font-mono font-bold text-foreground">
        {formatTime(timeRemaining)}
      </div>
      <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
        <div 
          className="h-2 bg-primary transition-all duration-1000 ease-linear"
          style={{ width: `${progress}%` }}
        />
      </div>
      <Badge variant={state === MatchState.IN_PROGRESS ? 'default' : 'secondary'}>
        {state.replace('_', ' ')}
      </Badge>
    </div>
  )
}

// Score display component
const ScoreCard = ({ 
  participant, 
  score, 
  isWinner,
  onScoreAction 
}: {
  participant: Match['participant1']
  score: Match['score1']
  isWinner: boolean
  onScoreAction: (action: ScoreAction) => void
}) => {
  return (
    <Card className={`transition-all ${isWinner ? 'ring-2 ring-green-500 bg-green-50 dark:bg-green-950' : ''}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex justify-between items-center">
          <span className="truncate">{participant.name}</span>
          {isWinner && <Badge variant="default" className="bg-green-600">Winner</Badge>}
        </CardTitle>
        {participant.team && (
          <p className="text-sm text-muted-foreground">{participant.team}</p>
        )}
        {participant.belt && (
          <Badge variant="outline" className="w-fit">{participant.belt}</Badge>
        )}
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Score Display */}
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <div className="text-3xl font-bold text-primary">{score.points}</div>
            <div className="text-sm text-muted-foreground">Points</div>
          </div>
          <div>
            <div className="text-2xl font-semibold text-blue-600">{score.advantages}</div>
            <div className="text-sm text-muted-foreground">Advantages</div>
          </div>
          <div>
            <div className="text-2xl font-semibold text-red-600">{score.penalties}</div>
            <div className="text-sm text-muted-foreground">Penalties</div>
          </div>
          <div>
            <div className="text-2xl font-semibold text-green-600">{score.submissions}</div>
            <div className="text-sm text-muted-foreground">Submissions</div>
          </div>
        </div>

        <Separator />

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2">
          <Button 
            onClick={() => onScoreAction(ScoreAction.POINTS_2)}
            className="bg-primary hover:bg-primary/90"
            size="lg"
          >
            +2 Points
          </Button>
          
          <Button 
            onClick={() => onScoreAction(ScoreAction.ADVANTAGE)}
            variant="outline"
            className="border-blue-500 text-blue-600 hover:bg-blue-50"
            size="lg"
          >
            Advantage
          </Button>
          
          <Button 
            onClick={() => onScoreAction(ScoreAction.PENALTY)}
            variant="outline"
            className="border-red-500 text-red-600 hover:bg-red-50"
            size="lg"
          >
            Penalty
          </Button>
          
          <Button 
            onClick={() => onScoreAction(ScoreAction.SUBMISSION)}
            variant="outline"
            className="border-green-500 text-green-600 hover:bg-green-50"
            size="lg"
          >
            Submission
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// Main referee page component
export default function RefereePage() {
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const matchId = params.matchId as string

  const [isLoading, setIsLoading] = useState(true)
  const [matchWinner, setMatchWinner] = useState<string | null>(null)

  const {
    match,
    socketState,
    sendScoreUpdate,
    sendMatchStateUpdate,
    connect,
    disconnect
  } = useMatchWebSocket({
    matchId,
    isReferee: true,
    onMatchUpdate: (updatedMatch) => {
      setIsLoading(false)
      
      // Check for winner
      const winner = getMatchWinner(updatedMatch)
      setMatchWinner(winner)
      
      // Auto-end match on submission or 3+ penalties
      if (updatedMatch.state === MatchState.IN_PROGRESS) {
        const hasSubmission = updatedMatch.score1.submissions > 0 || updatedMatch.score2.submissions > 0
        const hasDisqualification = updatedMatch.score1.penalties >= 3 || updatedMatch.score2.penalties >= 3
        
        if (hasSubmission || hasDisqualification) {
          sendMatchStateUpdate(MatchState.FINISHED)
        }
      }
    },
    onError: (error) => {
      toast({
        title: "Connection Error",
        description: error.message,
        variant: "destructive"
      })
    }
  })

  // Handle score actions
  const handleScoreAction = async (participantId: string, action: ScoreAction) => {
    try {
      await sendScoreUpdate(action, participantId)
      
      toast({
        title: "Score Updated",
        description: `${action.replace('_', ' ')} applied successfully`,
        duration: 2000
      })
    } catch (error) {
      toast({
        title: "Failed to Update Score",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      })
    }
  }

  // Handle match state changes
  const handleMatchStateChange = async (newState: MatchState) => {
    try {
      await sendMatchStateUpdate(newState)
      
      toast({
        title: "Match State Updated",
        description: `Match ${newState.toLowerCase().replace('_', ' ')}`,
        duration: 2000
      })
    } catch (error) {
      toast({
        title: "Failed to Update Match State",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      })
    }
  }

  // Auth check on mount
  useEffect(() => {
    // TODO: Add Supabase auth check for referee role
    // For now, we'll assume the user is authorized
    setIsLoading(false)
  }, [])

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto" />
          <p className="text-muted-foreground">Loading match...</p>
        </div>
      </div>
    )
  }

  if (!match) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center space-y-4">
            <h2 className="text-xl font-semibold">Match Not Found</h2>
            <p className="text-muted-foreground">
              The match with ID "{matchId}" could not be found.
            </p>
            <Button onClick={() => router.back()}>
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-2xl">Referee Panel</CardTitle>
                <p className="text-muted-foreground mt-1">
                  {match.category} • {match.division}
                </p>
              </div>
              
              <div className="flex items-center gap-2">
                {socketState.isConnected ? (
                  <Badge variant="default" className="bg-green-600">
                    <Wifi className="w-3 h-3 mr-1" />
                    Connected ({socketState.clientCount})
                  </Badge>
                ) : (
                  <Badge variant="destructive">
                    <WifiOff className="w-3 h-3 mr-1" />
                    Disconnected
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          
          <CardContent>
            <MatchTimer 
              timeRemaining={match.timeRemaining}
              duration={match.duration}
              state={match.state}
            />
          </CardContent>
        </Card>

        {/* Match Controls */}
        <Card>
          <CardHeader>
            <CardTitle>Match Controls</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 flex-wrap">
              <Button 
                onClick={() => handleMatchStateChange(MatchState.IN_PROGRESS)}
                disabled={match.state === MatchState.IN_PROGRESS}
                className="bg-green-600 hover:bg-green-700"
              >
                <Play className="w-4 h-4 mr-2" />
                Start
              </Button>
              
              <Button 
                onClick={() => handleMatchStateChange(MatchState.PAUSED)}
                disabled={match.state !== MatchState.IN_PROGRESS}
                variant="outline"
              >
                <Pause className="w-4 h-4 mr-2" />
                Pause
              </Button>
              
              <Button 
                onClick={() => handleMatchStateChange(MatchState.FINISHED)}
                disabled={match.state === MatchState.FINISHED}
                variant="outline"
                className="border-red-500 text-red-600 hover:bg-red-50"
              >
                <Square className="w-4 h-4 mr-2" />
                End Match
              </Button>
              
              <Button 
                onClick={() => handleMatchStateChange(MatchState.SCHEDULED)}
                variant="outline"
                className="border-orange-500 text-orange-600 hover:bg-orange-50"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Participants Score Cards */}
        <div className="grid md:grid-cols-2 gap-6">
          <ScoreCard
            participant={match.participant1}
            score={match.score1}
            isWinner={matchWinner === match.participant1.id}
            onScoreAction={(action) => handleScoreAction(match.participant1.id, action)}
          />
          
          <ScoreCard
            participant={match.participant2}
            score={match.score2}
            isWinner={matchWinner === match.participant2.id}
            onScoreAction={(action) => handleScoreAction(match.participant2.id, action)}
          />
        </div>

        {/* Connection Status */}
        {!socketState.isConnected && (
          <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <WifiOff className="w-4 h-4 text-yellow-600" />
                  <span className="text-yellow-800 dark:text-yellow-200">
                    Connection lost. Attempting to reconnect...
                  </span>
                </div>
                <Button 
                  onClick={connect}
                  variant="outline"
                  size="sm"
                  className="border-yellow-500"
                >
                  Retry
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

// Helper function to determine winner (duplicated from utils for now)
function getMatchWinner(match: Match): string | null {
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