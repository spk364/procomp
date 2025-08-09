import { isPagesDemo } from './runtime'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mod = isPagesDemo ? require('./demo/use-tournament-websocket.mock') : require('../app/dashboard/hooks/use-match-websocket')
export const useMatchWebSocket = mod.useMatchWebSocket
export const useMatchHUD = mod.useMatchWebSocket

export const useMatchWebSocket = mod.useMatchWebSocket