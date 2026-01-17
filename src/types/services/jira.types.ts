import type { JiraIssue } from '@/types'

export interface SearchResponse {
  issues: JiraIssue[]
  total: number
}

export interface WorklogApiResponse {
  worklogs: Array<{
    id: string
    author?: { accountId?: string; displayName?: string; emailAddress?: string }
    timeSpent: string
    timeSpentSeconds: number
    started?: string
    comment?: { content?: Array<{ content?: Array<{ text?: string }> }> }
    created: string
    updated: string
  }>
}

export interface UserResponse {
  accountId: string
  displayName: string
}
