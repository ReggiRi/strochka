/**
 * STROČKA Git Interface — абстракция системы контроля версий.
 *
 * @rationale Интерфейс отделён от реализации для смены бэкенда.
 */

export interface CommitEntry {
  oid: string
  message: string
  author: string
  email: string
  timestamp: string
}

/**
 * @rationale commit() сам stage-all, потому что в редакторе
 * нет промежуточного индексирования.
 */
export interface Git {
  initRepo(projectPath: string): Promise<void>

  commit(projectPath: string, message: string): Promise<string>

  log(projectPath: string, depth?: number): Promise<CommitEntry[]>

  status(projectPath: string): Promise<string[]>
}
