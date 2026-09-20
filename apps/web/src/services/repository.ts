import { createMockRepository } from '@career-launch/api-client'
export const repository = createMockRepository({ storage: 'indexeddb', latencyMs: 220 })
