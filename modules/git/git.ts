/**
 * STROČKA Git Module — реализация на isomorphic-git + lightning-fs.
 *
 * Использует lightning-fs (IndexedDB) для виртуальной файловой системы.
 * Перед коммитом синхронизирует документы из Storage в ФС.
 *
 * @rationale isomorphic-git выбран как единственная JS-библиотека git,
 * работающая в браузере без серверного бэкенда.
 */

import * as git from 'isomorphic-git'
import LightningFS from '@isomorphic-git/lightning-fs'
import type { Module } from '../../kernels/typescript/src/kernel.js'
import type { Storage } from '../storage/storage-interface.js'
import type { CommitEntry, Git } from './git-interface.js'

const fs = new LightningFS('strochka-git')

interface SyncedProject {
  projectId: string
  projectPath: string
  authorName: string
  authorEmail: string
}

function toCommitEntry(commit: git.ReadCommitResult): CommitEntry {
  return {
    oid: commit.oid,
    message: commit.commit.message.trimEnd(),
    author: commit.commit.author.name ?? '',
    email: commit.commit.author.email ?? '',
    timestamp: new Date(
      (commit.commit.author.timestamp ?? 0) * 1000,
    ).toISOString(),
  }
}

async function syncToFs(storage: Storage, projectPath: string, projectId: string): Promise<void> {
  const docs = await storage.listDocuments(projectId)
  for (const doc of docs) {
    await fs.promises.writeFile(`/${projectPath}/${doc.name}`, doc.content)
  }
}

async function stageAll(projectPath: string): Promise<void> {
  const files = await git.statusMatrix({ fs, dir: projectPath })
  for (const [filepath, , workdirStatus, stageStatus] of files) {
    if (workdirStatus !== stageStatus) {
      await git.add({ fs, dir: projectPath, filepath })
    }
  }
}

/**
 * Git-модуль на isomorphic-git.
 *
 * Зависимости: storage
 * События: git:commit — после успешного коммита
 */
export class GitModule implements Module, Git {
  name = 'git'
  version = '1.0.0'
  dependencies = ['storage']

  private kernel: import('../../kernels/typescript/src/kernel.js').Kernel | null = null
  private projects = new Map<string, SyncedProject>()

  init(kernel: import('../../kernels/typescript/src/kernel.js').Kernel): void {
    this.kernel = kernel
  }

  start(): void {}

  stop(): void {}

  destroy(): void {
    this.kernel = null
    this.projects.clear()
  }

  async initRepo(projectPath: string): Promise<void> {
    try {
      await fs.promises.mkdir(projectPath)
    } catch { /* exists */ }
    await git.init({ fs, dir: projectPath })
  }

  async commit(projectPath: string, message: string): Promise<string> {
    const storage = this.kernel!.getModule<Storage>('storage')
    if (!storage) throw new Error('Storage module not found')

    const synced = this.projects.get(projectPath)
    if (!synced) throw new Error(`Project ${projectPath} not registered. Call init() first.`)

    await syncToFs(storage, projectPath, synced.projectId)
    await stageAll(projectPath)

    const oid = await git.commit({
      fs,
      dir: projectPath,
      message,
      author: { name: synced.authorName, email: synced.authorEmail },
    })

    this.kernel!.emit('git:commit', { projectPath, message, oid })
    return oid
  }

  async log(projectPath: string, depth = 50): Promise<CommitEntry[]> {
    try {
      const commits = await git.log({ fs, dir: projectPath, depth })
      return commits.map(toCommitEntry)
    } catch {
      return []
    }
  }

  async status(projectPath: string): Promise<string[]> {
    const storage = this.kernel!.getModule<Storage>('storage')
    const synced = this.projects.get(projectPath)
    if (storage && synced) {
      await syncToFs(storage, projectPath, synced.projectId)
    }
    const matrix = await git.statusMatrix({ fs, dir: projectPath })
    return matrix
      .filter(([, head, workdir, stage]) => head !== 1 || workdir !== 1 || stage !== 1)
      .map(([filepath]) => filepath)
  }

  registerProject(projectId: string, projectPath: string, authorName: string, authorEmail: string): void {
    this.projects.set(projectPath, { projectId, projectPath, authorName, authorEmail })
  }
}
