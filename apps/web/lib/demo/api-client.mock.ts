import { z } from 'zod'
import {
  assignReferee as demoAssign,
  startMatch as demoStart,
  pauseMatch as demoPause,
  endMatch as demoEnd,
  toggleHud as demoToggle,
  getDemoMatches,
} from './mocks'

const MatchSchema = z.object({ id: z.string() })

export const api = {
  async assignReferee(matchId: string, refereeId: string) {
    const updated = demoAssign(matchId, refereeId)
    if (!updated) throw new Error('Match or referee not found')
    return MatchSchema.extend({}).parse(updated)
  },
  async startMatch(matchId: string) {
    const updated = demoStart(matchId)
    if (!updated) throw new Error('Match not found')
    return MatchSchema.extend({}).parse(updated)
  },
  async pauseMatch(matchId: string) {
    const updated = demoPause(matchId)
    if (!updated) throw new Error('Match not found')
    return MatchSchema.extend({}).parse(updated)
  },
  async endMatch(matchId: string) {
    const updated = demoEnd(matchId)
    if (!updated) throw new Error('Match not found')
    return MatchSchema.extend({}).parse(updated)
  },
  async toggleHud(matchId: string) {
    const updated = demoToggle(matchId)
    if (!updated) throw new Error('Match not found')
    return MatchSchema.extend({}).parse(updated)
  },
  async exportMatch(matchId: string, format: 'json' = 'json') {
    const match = getDemoMatches('t-1').concat(getDemoMatches('t-2')).find(m => m.id === matchId)
    if (!match) throw new Error('Match not found')
    if (format === 'json') return match
    const content = new Blob([`Demo PDF for match ${matchId}`], { type: 'application/pdf' })
    return content
  },
}