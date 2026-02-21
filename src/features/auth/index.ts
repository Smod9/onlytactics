import { appEnv } from '@/config/env'
import { authService } from './authService'
import { mockAuthService } from './mockAuthService'

// Export the appropriate auth service based on environment
export const auth = appEnv.mockAuth ? mockAuthService : authService

export * from './authTypes'
export { authService, type AdminRaceEntry, listRaces, setTrainingApproved, getTrainingStats } from './authService'
export { mockAuthService } from './mockAuthService'
