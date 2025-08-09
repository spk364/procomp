import { isPagesDemo } from './runtime'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { api } = isPagesDemo ? require('./demo/api-client.mock') : require('./api-client')

export { api }