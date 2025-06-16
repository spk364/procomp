import { z } from 'zod'

// Match states
export enum MatchState {
  SCHEDULED = 'SCHEDULED',
  IN_PROGRESS = 'IN_PROGRESS',
  PAUSED = 'PAUSED',
  FINISHED = 'FINISHED',
  CANCELLED = 'CANCELLED'
}

// Score action types
export enum ScoreAction {
  POINTS_2 = 'POINTS_2',
  ADVANTAGE = 'ADVANTAGE',
  PENALTY = 'PENALTY',
  SUBMISSION = 'SUBMISSION',
  RESET_MATCH = 'RESET_MATCH',
  START_MATCH = 'START_MATCH',
  PAUSE_MATCH = 'PAUSE_MATCH',
  END_MATCH = 'END_MATCH'
}

// Participant schema
export const ParticipantSchema = z.object({
  id: z.string(),
  name: z.string(),
  team: z.string().optional(),
  weight: z.number().optional(),
  belt: z.string().optional()
})

// Score schema
export const ScoreSchema = z.object({
  points: z.number().min(0),
  advantages: z.number().min(0),
  penalties: z.number().min(0),
  submissions: z.number().min(0)
})

// Match schema
export const MatchSchema = z.object({
  id: z.string(),
  participant1: ParticipantSchema,
  participant2: ParticipantSchema,
  category: z.string(),
  division: z.string(),
  duration: z.number().min(0), // in seconds
  timeRemaining: z.number().min(0), // in seconds
  state: z.nativeEnum(MatchState),
  score1: ScoreSchema,
  score2: ScoreSchema,
  referee: z.object({
    id: z.string(),
    name: z.string()
  }).optional(),
  createdAt: z.string(),
  updatedAt: z.string()
})

// WebSocket message schemas
export const ScoreUpdateSchema = z.object({
  action: z.nativeEnum(ScoreAction),
  participantId: z.string(),
  value: z.number().optional(),
  timestamp: z.string()
})

export const WebSocketMessageSchema = z.object({
  type: z.enum(['SCORE_UPDATE', 'MATCH_UPDATE', 'TIMER_UPDATE', 'CONNECTION_STATUS']),
  matchId: z.string(),
  data: z.union([
    ScoreUpdateSchema,
    MatchSchema,
    z.object({ timeRemaining: z.number() }),
    z.object({ connected: z.boolean(), clientCount: z.number() })
  ]),
  timestamp: z.string()
})

// Type exports
export type Participant = z.infer<typeof ParticipantSchema>
export type Score = z.infer<typeof ScoreSchema>
export type Match = z.infer<typeof MatchSchema>
export type ScoreUpdate = z.infer<typeof ScoreUpdateSchema>
export type WebSocketMessage = z.infer<typeof WebSocketMessageSchema>

// Helper function to create initial score
export const createInitialScore = (): Score => ({
  points: 0,
  advantages: 0,
  penalties: 0,
  submissions: 0
})

// Helper function to apply score action
export const applyScoreAction = (score: Score, action: ScoreAction): Score => {
  const newScore = { ...score }
  
  switch (action) {
    case ScoreAction.POINTS_2:
      newScore.points += 2
      break
    case ScoreAction.ADVANTAGE:
      newScore.advantages += 1
      break
    case ScoreAction.PENALTY:
      newScore.penalties += 1
      break
    case ScoreAction.SUBMISSION:
      newScore.submissions += 1
      break
    default:
      break
  }
  
  return newScore
}

// Helper function to determine match winner
export const getMatchWinner = (match: Match): string | null => {
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