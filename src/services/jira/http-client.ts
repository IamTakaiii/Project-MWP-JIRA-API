import { ExternalServiceError, createLogger } from '@/lib'
import type { JiraCredentials } from '@/types'

const log = createLogger('JiraHttpClient')

const CONCURRENCY = 6

function buildAuthHeader(email: string, apiToken: string): string {
  return `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`
}

export function buildApiUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}/rest/api/3${path}`
}

export function buildAgileUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, '')}/rest/agile/1.0${path}`
}

export async function request<T>(
  url: string,
  method: string,
  credentials: JiraCredentials,
  body?: unknown,
): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: {
      Authorization: buildAuthHeader(credentials.email, credentials.apiToken),
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  const text = await response.text()

  if (!response.ok) {
    log.warn({ url, status: response.status }, 'Jira API error')
    throw new ExternalServiceError('Jira API', response.status, text)
  }

  return text ? JSON.parse(text) : ({} as T)
}

export async function processBatch<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  batchSize = CONCURRENCY,
): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = await Promise.all(items.slice(i, i + batchSize).map(fn))
    results.push(...batch)
  }
  return results
}
