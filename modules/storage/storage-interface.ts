/**
 * STROČKA Storage Interface — абстракция хранилища проектов и документов.
 *
 * @rationale Интерфейс отделён от реализации, чтобы можно было менять
 * бэкенд (IndexedDB, File System API, remote) без изменения кода модулей.
 */

/**
 * Метаданные проекта.
 */
export interface Project {
  /** Уникальный идентификатор (UUID v4). */
  id: string
  /** Человеческое название проекта. */
  name: string
  /** ISO-строка даты создания. */
  createdAt: string
  /** ISO-строка даты последнего изменения. */
  updatedAt: string
}

/**
 * Документ (файл) внутри проекта.
 */
export interface StoredDocument {
  /** Уникальный идентификатор (UUID v4). */
  id: string
  /** ID проекта-родителя. */
  projectId: string
  /** Имя файла (с расширением, например 'glava-1.md'). */
  name: string
  /** Содержимое документа (Markdown). */
  content: string
  /** ISO-строка даты создания. */
  createdAt: string
  /** ISO-строка даты последнего изменения. */
  updatedAt: string
}

/**
 * Контракт хранилища STROČKA.
 *
 * Все методы асинхронные. Ошибки выбрасываются через throw.
 *
 * @rationale Асинхронность на уровне интерфейса, а не реализации —
 * любой бэкенд может быть latency-bound (IndexedDB, HTTP).
 */
export interface Storage {
  // ── Проекты ──────────────────────────────────────────

  /** Возвращает список всех проектов. @time O(n) */
  listProjects(): Promise<Project[]>

  /** Создаёт проект с указанным именем. @time O(1) */
  createProject(name: string): Promise<Project>

  /** Удаляет проект и все его документы. @throws Error если проект не найден. @time O(n) */
  deleteProject(id: string): Promise<void>

  // ── Документы ────────────────────────────────────────

  /** Возвращает список документов в проекте. @throws Error если проект не найден. @time O(n) */
  listDocuments(projectId: string): Promise<StoredDocument[]>

  /** Создаёт документ в проекте.
   * @param content — начальное содержимое (по умолчанию '')
   * @throws Error если проект не найден
   * @time O(1) */
  createDocument(projectId: string, name: string, content?: string): Promise<StoredDocument>

  /** Возвращает документ по ID. @returns документ или null если не найден. @time O(1) */
  readDocument(id: string): Promise<StoredDocument | null>

  /** Обновляет содержимое документа. @throws Error если документ не найден. @time O(1) */
  updateDocument(id: string, content: string): Promise<void>

  /** Удаляет документ. @throws Error если документ не найден. @time O(1) */
  deleteDocument(id: string): Promise<void>

  /** Переименовывает документ. @throws Error если документ не найден. @time O(1) */
  renameDocument(id: string, name: string): Promise<void>
}
