export interface DemoTournament {
  id: string
  name: string
  startDate: string
  endDate: string
  status: 'draft' | 'published' | 'active' | 'completed'
}

export interface DemoReferee {
  id: string
  name: string
  email: string
  available: boolean
  currentMatchId?: string
}

export interface DemoMatch {
  id: string
  tournamentId: string
  category: string
  division: string
  bracket: string
  position: string
  athlete1Id?: string
  athlete2Id?: string
  athlete1Name?: string
  athlete2Name?: string
  status: 'waiting' | 'active' | 'completed'
  score1?: number
  score2?: number
  winnerAthleteId?: string
  refereeId?: string
  refereeName?: string
  matNumber?: number
  startTime?: string
  endTime?: string
  hudActive?: boolean
  createdAt: string
  updatedAt: string
}

const nowIso = () => new Date().toISOString()

const tournaments: DemoTournament[] = [
  { id: 't-1', name: 'City Open 2025', startDate: nowIso(), endDate: nowIso(), status: 'active' },
  { id: 't-2', name: 'Regional Cup 2025', startDate: nowIso(), endDate: nowIso(), status: 'published' },
]

const referees: DemoReferee[] = [
  { id: 'r-1', name: 'Alex Morgan', email: 'alex@example.com', available: true },
  { id: 'r-2', name: 'Jordan Lee', email: 'jordan@example.com', available: false, currentMatchId: 'm-2' },
  { id: 'r-3', name: 'Sam Patel', email: 'sam@example.com', available: true },
]

const matches: DemoMatch[] = [
  {
    id: 'm-1',
    tournamentId: 't-1',
    category: 'Adults',
    division: 'Lightweight',
    bracket: 'A',
    position: '1',
    athlete1Id: 'a1',
    athlete2Id: 'a2',
    athlete1Name: 'John Doe',
    athlete2Name: 'Mark Smith',
    status: 'waiting',
    score1: 0,
    score2: 0,
    refereeId: 'r-1',
    refereeName: 'Alex Morgan',
    matNumber: 1,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: 'm-2',
    tournamentId: 't-1',
    category: 'Adults',
    division: 'Middleweight',
    bracket: 'A',
    position: '2',
    athlete1Id: 'a3',
    athlete2Id: 'a4',
    athlete1Name: 'Jane Roe',
    athlete2Name: 'Alice Lee',
    status: 'active',
    score1: 2,
    score2: 0,
    refereeId: 'r-2',
    refereeName: 'Jordan Lee',
    matNumber: 1,
    startTime: nowIso(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
  {
    id: 'm-3',
    tournamentId: 't-2',
    category: 'Teens',
    division: 'Featherweight',
    bracket: 'B',
    position: '1',
    athlete1Id: 'a5',
    athlete2Id: 'a6',
    athlete1Name: 'Leo Park',
    athlete2Name: 'Omar Khan',
    status: 'completed',
    score1: 7,
    score2: 3,
    refereeId: 'r-3',
    refereeName: 'Sam Patel',
    matNumber: 2,
    endTime: nowIso(),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  },
]

// In-memory store for demo mutations
const state = {
  tournaments,
  referees,
  matches,
}

export function getDemoTournaments(): DemoTournament[] {
  return [...state.tournaments]
}

export function getDemoMatches(tournamentId: string): DemoMatch[] {
  return state.matches.filter(m => m.tournamentId === tournamentId).map(m => ({ ...m }))
}

export function getDemoReferees(): DemoReferee[] {
  return [...state.referees]
}

export function assignReferee(matchId: string, refereeId: string): DemoMatch | undefined {
  const match = state.matches.find(m => m.id === matchId)
  const ref = state.referees.find(r => r.id === refereeId)
  if (!match || !ref) return undefined
  match.refereeId = ref.id
  match.refereeName = ref.name
  match.updatedAt = nowIso()
  state.referees = state.referees.map(r => r.id === ref.id ? { ...r, available: false, currentMatchId: match.id } : r)
  return { ...match }
}

export function startMatch(matchId: string): DemoMatch | undefined {
  const match = state.matches.find(m => m.id === matchId)
  if (!match) return undefined
  match.status = 'active'
  match.startTime = match.startTime || nowIso()
  match.updatedAt = nowIso()
  return { ...match }
}

export function pauseMatch(matchId: string): DemoMatch | undefined {
  const match = state.matches.find(m => m.id === matchId)
  if (!match) return undefined
  match.status = 'waiting'
  match.updatedAt = nowIso()
  return { ...match }
}

export function endMatch(matchId: string): DemoMatch | undefined {
  const match = state.matches.find(m => m.id === matchId)
  if (!match) return undefined
  match.status = 'completed'
  match.endTime = nowIso()
  match.updatedAt = nowIso()
  return { ...match }
}

export function toggleHud(matchId: string): DemoMatch | undefined {
  const match = state.matches.find(m => m.id === matchId)
  if (!match) return undefined
  match.hudActive = !match.hudActive
  match.updatedAt = nowIso()
  return { ...match }
}

export function getDemoMatchIds(): string[] {
  return state.matches.map(m => m.id)
}

export type TickHandler = (m: DemoMatch) => void
let tickerInterval: ReturnType<typeof setInterval> | null = null

export function startDemoTicker(tournamentId: string, onTick: TickHandler) {
  stopDemoTicker()
  tickerInterval = setInterval(() => {
    const candidates = state.matches.filter(m => m.tournamentId === tournamentId)
    if (!candidates.length) return
    const idx = Math.floor(Math.random() * candidates.length)
    const match = candidates[idx]
    if (match.status === 'active') {
      // small score drift
      match.score1 = Math.max(0, (match.score1 || 0) + (Math.random() < 0.5 ? 1 : 0))
      match.score2 = Math.max(0, (match.score2 || 0) + (Math.random() < 0.5 ? 1 : 0))
      match.updatedAt = nowIso()
      onTick({ ...match })
    } else if (match.status === 'waiting' && Math.random() < 0.2) {
      match.status = 'active'
      match.startTime = match.startTime || nowIso()
      match.updatedAt = nowIso()
      onTick({ ...match })
    }
  }, 2000)
}

export function stopDemoTicker() {
  if (tickerInterval) clearInterval(tickerInterval)
  tickerInterval = null
}