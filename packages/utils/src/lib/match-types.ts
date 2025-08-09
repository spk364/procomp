import { z } from 'zod';

// Match states as enum
export enum MatchState {
  SCHEDULED = 'scheduled',
  IN_PROGRESS = 'in_progress',
  PAUSED = 'paused',
  FINISHED = 'finished'
}

// Score action types as enum
export enum ScoreAction {
  POINTS_2 = 'points_2',
  POINTS_3 = 'points_3',
  POINTS_4 = 'points_4',
  ADVANTAGE = 'advantage',
  PENALTY = 'penalty',
  SUBMISSION = 'submission'
}

// Score structure
export interface Score {
  points: number;
  advantages: number;
  penalties: number;
  submissions: number;
}

// Match and tournament types
export interface Match {
  id: string;
  tournamentId: string;
  participant1: {
    id: string;
    name: string;
    club: string;
    weight: number;
    team?: string;
    belt?: string;
  };
  participant2: {
    id: string;
    name: string;
    club: string;
    weight: number;
    team?: string;
    belt?: string;
  };
  score1: Score;
  score2: Score;
  duration: number; // in seconds
  timeRemaining: number; // in seconds
  state: MatchState;
  winner?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MatchEvent {
  id: string;
  matchId: string;
  type: 'score' | 'timer' | 'state_change';
  data: any;
  timestamp: string;
}

export interface Tournament {
  id: string;
  name: string;
  date: string;
  location: string;
  status: 'upcoming' | 'active' | 'completed';
  categories: Category[];
}

export interface Category {
  id: string;
  name: string;
  weightMin: number;
  weightMax: number;
  ageMin: number;
  ageMax: number;
  belt?: string;
}

export interface Participant {
  id: string;
  name: string;
  club: string;
  age: number;
  weight: number;
  email: string;
  categoryId: string;
  tournamentId: string;
  team?: string;
  belt?: string;
}

// WebSocket message types
export interface WSMessage {
  type: 'match_update' | 'score_update' | 'timer_update' | 'state_change';
  matchId: string;
  data: any;
  timestamp: string;
}

export interface MatchUpdateData {
  match: Match;
  event: MatchEvent;
}

// Zod schemas
export const ParticipantSchema = z.object({
  id: z.string(),
  name: z.string(),
  club: z.string(),
  age: z.number(),
  weight: z.number(),
  email: z.string().email(),
  categoryId: z.string(),
  tournamentId: z.string(),
  team: z.string().optional(),
  belt: z.string().optional(),
});

export const ScoreSchema = z.object({
  points: z.number(),
  advantages: z.number(),
  penalties: z.number(),
  submissions: z.number(),
});

export const MatchSchema = z.object({
  id: z.string(),
  tournamentId: z.string(),
  participant1: z.object({
    id: z.string(),
    name: z.string(),
    club: z.string(),
    weight: z.number(),
    team: z.string().optional(),
    belt: z.string().optional(),
  }),
  participant2: z.object({
    id: z.string(),
    name: z.string(),
    club: z.string(),
    weight: z.number(),
    team: z.string().optional(),
    belt: z.string().optional(),
  }),
  score1: ScoreSchema,
  score2: ScoreSchema,
  duration: z.number(),
  timeRemaining: z.number(),
  state: z.nativeEnum(MatchState),
  winner: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

// Utility functions
export const getMatchWinner = (match: Match): string | null => {
  if (match.state !== MatchState.FINISHED) return null;
  
  const { score1, score2 } = match;
  
  // Check for submission
  if (score1.submissions > 0) return match.participant1.id;
  if (score2.submissions > 0) return match.participant2.id;
  
  // Check for disqualification (3 penalties)
  if (score1.penalties >= 3) return match.participant2.id;
  if (score2.penalties >= 3) return match.participant1.id;
  
  // Check points
  if (score1.points > score2.points) return match.participant1.id;
  if (score2.points > score1.points) return match.participant2.id;
  
  // Check advantages
  if (score1.advantages > score2.advantages) return match.participant1.id;
  if (score2.advantages > score1.advantages) return match.participant2.id;
  
  // Check penalties (fewer is better)
  if (score1.penalties < score2.penalties) return match.participant1.id;
  if (score2.penalties < score1.penalties) return match.participant2.id;
  
  // Draw
  return null;
}; 