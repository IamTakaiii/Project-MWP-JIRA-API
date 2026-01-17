export interface UnauthenticatedResponse {
  authenticated: false
}

export interface AuthenticatedResponse {
  authenticated: true
  jiraUrl: string
  email: string
  sessionInfo: {
    createdAt: number
    lastAccessed: number
    age: number
    idleTime: number
  } | null
}

export type MeResponse = UnauthenticatedResponse | AuthenticatedResponse
