/**
 * STROČKA Git Module — тесты с fake-indexeddb.
 *
 * LightningFS использует IndexedDB, поэтому fake-indexeddb обязателен.
 */

import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { GitModule } from '../git.js'
import { type Kernel, type Module } from '../../../kernels/typescript/src/kernel.js'
import { type Storage, type Project, type StoredDocument } from '../../storage/storage-interface.js'

let docCounter = 0

class FakeStorage implements Storage, Module {
  name = 'storage'
  version = '1.0.0'
  dependencies: string[] = []
  private docs = new Map<string, StoredDocument>()
  private renames = new Map<string, string>()

  // Module
  init(): void {}
  start(): void {}
  stop(): void {}
  destroy(): void {}

  // Storage
  async listProjects(): Promise<Project[]> { return [] }
  async createProject(): Promise<Project> { throw new Error('Not implemented') }
  async deleteProject(): Promise<void> {}

  async listDocuments(projectId: string): Promise<StoredDocument[]> {
    return Array.from(this.docs.values()).filter((d) => d.projectId === projectId)
  }

  async createDocument(projectId: string, name: string, content = ''): Promise<StoredDocument> {
    docCounter++
    const existing = Array.from(this.docs.values()).find((d) => d.projectId === projectId && d.name === name)
    const id = existing ? existing.id : String(docCounter)
    const doc: StoredDocument = { id, projectId, name, content, createdAt: '', updatedAt: '' }
    this.docs.set(id, doc)
    return doc
  }

  async readDocument(): Promise<StoredDocument | null> { return null }
  async updateDocument(): Promise<void> {}
  async deleteDocument(): Promise<void> {}
  async renameDocument(): Promise<void> {}
}

let sharedStorage = new FakeStorage()

class FakeKernel implements Kernel {
  async emit(): Promise<void> {}
  getModule<T>(name: string): T | undefined {
    if (name === 'storage') return sharedStorage as unknown as T
    return undefined
  }
  on(): () => void { return () => {} }
  off(): void {}
  async register(): Promise<void> {}
  async start(): Promise<void> {}
  async stop(): Promise<void> {}
  destroy(): void {}
}

let testNum = 0

describe('GitModule', () => {
  let git: GitModule
  let kernel: FakeKernel
  let storage: FakeStorage
  let projectPath: string

  beforeEach(async () => {
    testNum++
    projectPath = `/test-project-${testNum}`
    sharedStorage = new FakeStorage()
    docCounter = 0
    kernel = new FakeKernel()
    storage = kernel.getModule('storage')!
    git = new GitModule()
    git.init(kernel)
    await git.start()
  })

  it('initRepo creates a git repository', async () => {
    await git.initRepo(projectPath)
    const log = await git.log(projectPath)
    expect(log).toEqual([])
  })

  it('commit creates a commit and returns oid', async () => {
    await git.initRepo(projectPath)
    const projectId = 'p1'
    await storage.createDocument(projectId, 'test.md', '# Hello')
    git.registerProject(projectId, projectPath, 'Test', 'test@test.com')

    const oid = await git.commit(projectPath, 'First commit')
    expect(oid).toBeTruthy()
    expect(typeof oid).toBe('string')
  })

  it('log returns commits in reverse order', async () => {
    await git.initRepo(projectPath)
    const projectId = 'p1'
    await storage.createDocument(projectId, 'a.md', 'content a')
    git.registerProject(projectId, projectPath, 'Test', 'test@test.com')

    await git.commit(projectPath, 'First')
    await git.commit(projectPath, 'Second')

    const log = await git.log(projectPath)
    expect(log).toHaveLength(2)
    expect(log[0]!.message).toBe('Second')
    expect(log[1]!.message).toBe('First')
  })

  it('status shows modified files', async () => {
    await git.initRepo(projectPath)
    const projectId = 'p1'
    await storage.createDocument(projectId, 'file.md', 'initial')
    git.registerProject(projectId, projectPath, 'Test', 'test@test.com')
    await git.commit(projectPath, 'Initial')

    await storage.createDocument(projectId, 'file.md', 'modified')
    const status = await git.status(projectPath)
    expect(status).toContain('file.md')
  })
})
