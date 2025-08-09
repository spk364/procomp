import { isPagesDemo } from '../../../../lib/runtime'
import { getDemoMatchIds } from '../../../../lib/demo/mocks'

export function generateStaticParams() {
  if (!isPagesDemo) return []
  const ids = getDemoMatchIds().slice(0, 3)
  return ids.map(id => ({ matchId: id }))
}