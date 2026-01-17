import { JiraService } from '@/services'
import { getCredentialsFromCookie } from '@/middleware'
import type { CookieRecord } from '@/lib/cookie'
import type { TaskSearchOptions } from '@/types/controllers/task.types'

export class TaskController {
  async searchMyTasks(cookie: CookieRecord, options: TaskSearchOptions) {
    const credentials = await getCredentialsFromCookie(cookie)
    return JiraService.searchMyTasks(credentials, options)
  }
}
