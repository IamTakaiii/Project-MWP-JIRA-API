import type { CookieRecord } from '@/lib/cookie'
import { getCredentialsFromCookie } from '@/middleware'
import { JiraService } from '@/services'
import type { TaskSearchOptions } from '@/types'

export async function searchMyTasks(cookie: CookieRecord, options: TaskSearchOptions) {
  const credentials = await getCredentialsFromCookie(cookie)
  return JiraService.searchMyTasks(credentials, options)
}
