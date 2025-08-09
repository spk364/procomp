import { isPagesDemo } from './runtime'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mod = isPagesDemo ? require('./demo/use-match-websocket.mock') : require('@procomp/utils')

export const useMatchWebSocket = mod.useMatchWebSocket
export const useMatchHUD = mod.useMatchWebSocket