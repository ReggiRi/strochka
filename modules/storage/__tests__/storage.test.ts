/**
 * STROČKA Storage Module — тесты.
 *
 * Использует fake-indexeddb для изолированного тестирования IndexedDB.
 * Каждый тест создаёт новый экземпляр StorageModule с чистой БД.
 */

import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { StorageModule } from '../storage-indexeddb.js'
import { type Kernel } from '../../../kernels/typescript/src/kernel.js'

class FakeKernel implements Kernel {
  events: Array<{ event: string; payload: unknown }> = []

  async emit(event: string, payload: unknown): Promise<void> {
    this.events.push({ event, payload })
  }
  getModule(): undefined { return undefined }
  on(): () => void { return () => {} }
  off(): void {}
  async register(): Promise<void> {}
  async start(): Promise<void> {}
  async stop(): Promise<void> {}
  destroy(): void {}
}

let storage: StorageModule
let kernel: FakeKernel
let testDbNum = 0

beforeEach(async () => {
  testDbNum++
  storage = new StorageModule(`test-db-${testDbNum}`)
  kernel = new FakeKernel()
  storage.init(kernel)
  await storage.start()
})

afterEach(() => {
  storage.destroy()
})

describe('StorageModule — Project CRUD', () => {
  it('creates a project and emits project:created', async () => {
    const project = await storage.createProject('Мой роман')
    expect(project.name).toBe('Мой роман')
    expect(project.id).toBeTruthy()
    expect(kernel.events.some((e) => e.event === 'project:created')).toBe(true)
  })

  it('lists all projects', async () => {
    await storage.createProject('A')
    await storage.createProject('B')
    const list = await storage.listProjects()
    expect(list).toHaveLength(2)
  })

  it('deletes a project and its documents', async () => {
    const project = await storage.createProject('Удаляемый')
    await storage.createDocument(project.id, 'file.md')
    await storage.deleteProject(project.id)
    const list = await storage.listProjects()
    expect(list).toHaveLength(0)
    const docs = await storage.listDocuments(project.id)
    expect(docs).toHaveLength(0)
  })
})

describe('StorageModule — Document CRUD', () => {
  let projectId: string

  beforeEach(async () => {
    const p = await storage.createProject('Тестовый')
    projectId = p.id
  })

  it('creates a document and emits document:created', async () => {
    const doc = await storage.createDocument(projectId, 'glava-1.md')
    expect(doc.name).toBe('glava-1.md')
    expect(doc.projectId).toBe(projectId)
  })

  it('lists documents in a project', async () => {
    await storage.createDocument(projectId, 'a.md')
    await storage.createDocument(projectId, 'b.md')
    const docs = await storage.listDocuments(projectId)
    expect(docs).toHaveLength(2)
  })

  it('reads a document', async () => {
    const doc = await storage.createDocument(projectId, 'test.md', 'Hello')
    const read = await storage.readDocument(doc.id)
    expect(read).not.toBeNull()
    expect(read!.content).toBe('Hello')
  })

  it('returns null for missing document', async () => {
    const read = await storage.readDocument('nonexistent')
    expect(read).toBeNull()
  })

  it('updates a document and emits document:changed', async () => {
    const doc = await storage.createDocument(projectId, 'edit.md', 'old')
    await storage.updateDocument(doc.id, 'new content')
    const read = await storage.readDocument(doc.id)
    expect(read!.content).toBe('new content')
    expect(read!.updatedAt >= read!.createdAt).toBe(true)
  })

  it('throws on update for missing document', async () => {
    await expect(storage.updateDocument('nowhere', 'x')).rejects.toThrow('not found')
  })

  it('deletes a document', async () => {
    const doc = await storage.createDocument(projectId, 'del.md')
    await storage.deleteDocument(doc.id)
    const read = await storage.readDocument(doc.id)
    expect(read).toBeNull()
  })

  it('renames a document', async () => {
    const doc = await storage.createDocument(projectId, 'old.md')
    await storage.renameDocument(doc.id, 'new.md')
    const read = await storage.readDocument(doc.id)
    expect(read!.name).toBe('new.md')
    expect(read!.updatedAt >= read!.createdAt).toBe(true)
  })

  it('throws on delete for missing document', async () => {
    await expect(storage.deleteDocument('void')).rejects.toThrow('not found')
  })
})

describe('StorageModule — lifecycle', () => {
  it('emits storage:ready on start', async () => {
    const s = new StorageModule()
    const k = new FakeKernel()
    s.init(k)
    await s.start()
    expect(k.events.some((e) => e.event === 'storage:ready')).toBe(true)
  })

  it('start/stop/destroy do not throw', async () => {
    const s = new StorageModule()
    s.init(kernel)
    await s.start()
    s.stop()
    s.destroy()
  })
})
