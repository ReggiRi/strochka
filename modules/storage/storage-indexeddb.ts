/**
 * STROČKA Storage Module — IndexedDB реализация.
 *
 * Два object store: `projects` и `documents`.
 * Одновременно Module (lifecycle) и Storage (CRUD).
 *
 * @rationale IndexedDB — встроенный браузерный API для структурированных данных.
 *
 * События: storage:ready, project:created, project:deleted,
 * document:created, document:changed, document:deleted.
 */

import type { Kernel, Module } from '../../kernels/typescript/src/kernel.js'
import type { Project, StoredDocument, Storage } from './storage-interface.js'

const DB_NAME = 'strochka'
const DB_VERSION = 1

/**
 * @returns UUID v4 строка
 * @time O(1)
 */
function uuid(): string { return crypto.randomUUID() }

/**
 * @returns ISO-строка текущего времени
 * @time O(1)
 */
function nowISO(): string { return new Date().toISOString() }

/**
 * Открывает (или создаёт) IndexedDB.
 *
 * @param dbName — имя базы данных
 * @param version — версия схемы
 * @returns IDBDatabase
 *
 * @throws Error если браузер не поддерживает IndexedDB
 * @time O(1) — асинхронный вызов
 */
function openDB(dbName: string = DB_NAME, version: number = DB_VERSION): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, version)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains('projects')) {
        const store = db.createObjectStore('projects', { keyPath: 'id' })
        store.createIndex('name', 'name', { unique: false })
      }
      if (!db.objectStoreNames.contains('documents')) {
        const store = db.createObjectStore('documents', { keyPath: 'id' })
        store.createIndex('projectId', 'projectId', { unique: false })
        store.createIndex('name', 'name', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/**
 * Обёртка IDBRequest в Promise.
 *
 * @param request — IDBRequest любого типа
 * @returns результат запроса
 * @time O(1) — ожидание асинхронной операции
 */
function req<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/**
 * Создаёт транзакцию и вызывает в ней fn.
 *
 * @param db — открытая база данных
 * @param storeNames — имена object store
 * @param mode — режим транзакции
 * @param fn — функция, получающая массив store
 * @returns результат fn
 * @time O(1) — создание транзакции
 */
function withStore<T>(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const transaction = db.transaction(storeName, mode)
  return fn(transaction.objectStore(storeName))
}

function withStores2<T>(
  db: IDBDatabase,
  a: string, b: string,
  mode: IDBTransactionMode,
  fn: (sa: IDBObjectStore, sb: IDBObjectStore) => Promise<T>,
): Promise<T> {
  const transaction = db.transaction([a, b], mode)
  return fn(transaction.objectStore(a), transaction.objectStore(b))
}

/**
 * Модуль хранилища на IndexedDB.
 * Реализует Module и Storage.
 */
export class StorageModule implements Module, Storage {
  name = 'storage'
  version = '1.0.0'
  dependencies: string[] = []

  private db: IDBDatabase | null = null
  private kernel: Kernel | null = null

  /**
   * @param kernel — ссылка на ядро для событий
   * @time O(1)
   */
  init(kernel: Kernel): void { this.kernel = kernel }

  /**
   * Открывает IndexedDB и испускает storage:ready.
   * @time O(1) — асинхронное открытие DB
   */
  async start(): Promise<void> {
    this.db = await openDB()
    this.kernel?.emit('storage:ready', {})
  }

  /** @time O(1) */
  stop(): void { this.db?.close(); this.db = null }

  /** @time O(1) */
  destroy(): void { this.stop(); this.kernel = null }

  // ── Projects ────────────────────────────────────────

  /** @time O(n) */
  async listProjects(): Promise<Project[]> {
    return withStore(this.db!, 'projects', 'readonly', (s) => req(s.getAll()))
  }

  /**
   * @param name — имя нового проекта
   * @returns созданный проект
   * @time O(1)
   */
  async createProject(name: string): Promise<Project> {
    const project: Project = { id: uuid(), name, createdAt: nowISO(), updatedAt: nowISO() }
    await withStore(this.db!, 'projects', 'readwrite', (s) => req(s.add(project)))
    this.kernel?.emit('project:created', { project })
    return project
  }

  /**
   * @param id — ID проекта
   * @throws Error если проект не найден (через listDocuments)
   * @time O(n)
   */
  async deleteProject(id: string): Promise<void> {
    const docs = await this.listDocuments(id)
    await withStores2(this.db!, 'projects', 'documents', 'readwrite', async (ps, ds) => {
      await req(ps.delete(id))
      for (const doc of docs) await req(ds.delete(doc.id))
    })
    this.kernel?.emit('project:deleted', { projectId: id })
  }

  // ── Documents ───────────────────────────────────────

  /**
   * @param projectId — ID проекта
   * @throws Error если проект не найден
   * @time O(n)
   */
  async listDocuments(projectId: string): Promise<StoredDocument[]> {
    return withStore(this.db!, 'documents', 'readonly', async (s) => {
      return req(s.index('projectId').getAll(projectId)) as Promise<StoredDocument[]>
    })
  }

  /**
   * @param projectId — ID проекта
   * @param name — имя файла
   * @param content — начальное содержимое
   * @returns созданный документ
   * @time O(1)
   */
  async createDocument(projectId: string, name: string, content = ''): Promise<StoredDocument> {
    const doc: StoredDocument = {
      id: uuid(), projectId, name, content,
      createdAt: nowISO(), updatedAt: nowISO(),
    }
    await withStore(this.db!, 'documents', 'readwrite', (s) => req(s.add(doc)))
    this.kernel?.emit('document:created', { document: doc })
    return doc
  }

  /**
   * @param id — ID документа
   * @returns документ или null
   * @time O(1)
   */
  async readDocument(id: string): Promise<StoredDocument | null> {
    return withStore(this.db!, 'documents', 'readonly', async (s) => {
      return (await req(s.get(id)) as StoredDocument) ?? null
    })
  }

  /**
   * @param id — ID документа
   * @param content — новое содержимое
   * @throws Error если документ не найден
   * @time O(1)
   */
  async updateDocument(id: string, content: string): Promise<void> {
    const doc = await this.readDocument(id)
    if (!doc) throw new Error(`Document ${id} not found`)
    doc.content = content; doc.updatedAt = nowISO()
    await withStore(this.db!, 'documents', 'readwrite', (s) => req(s.put(doc)))
    this.kernel?.emit('document:changed', { document: doc })
  }

  /**
   * @param id — ID документа
   * @throws Error если документ не найден
   * @time O(1)
   */
  async deleteDocument(id: string): Promise<void> {
    const doc = await this.readDocument(id)
    if (!doc) throw new Error(`Document ${id} not found`)
    await withStore(this.db!, 'documents', 'readwrite', (s) => req(s.delete(id)))
    this.kernel?.emit('document:deleted', { documentId: id })
  }

  /**
   * @param id — ID документа
   * @param name — новое имя
   * @throws Error если документ не найден
   * @time O(1)
   */
  async renameDocument(id: string, name: string): Promise<void> {
    const doc = await this.readDocument(id)
    if (!doc) throw new Error(`Document ${id} not found`)
    doc.name = name; doc.updatedAt = nowISO()
    await withStore(this.db!, 'documents', 'readwrite', (s) => req(s.put(doc)))
    this.kernel?.emit('document:changed', { document: doc })
  }
}
