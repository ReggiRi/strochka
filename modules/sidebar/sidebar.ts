/**
 * STROČKA Sidebar Module — файловое дерево и управление проектами.
 *
 * @rationale Единственное UI-место для управления структурой проекта.
 *
 * Зависимости: storage
 * События: editor:load — при клике на документ
 */

import type { Kernel, Module } from '../../kernels/typescript/src/kernel.js'
import type { Storage, Project, StoredDocument } from '../storage/storage-interface.js'

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text: string,
  onClick?: (e: Event) => void,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag)
  element.className = className
  element.textContent = text
  if (onClick) element.addEventListener('click', onClick)
  return element
}

/**
 * Модуль боковой панели с файловым деревом.
 */
export class SidebarModule implements Module {
  name = 'sidebar'
  version = '1.0.0'
  dependencies = ['storage']

  private kernel: Kernel | null = null
  private container: HTMLElement | null = null
  private storage: Storage | null = null
  private unsubscribers: Array<() => void> = []

  init(kernel: Kernel): void {
    this.kernel = kernel
    const container = document.getElementById('file-tree')
    if (!container) throw new Error('File tree container #file-tree not found')
    this.container = container
  }

  async start(): Promise<void> {
    const mod = this.kernel!.getModule('storage')
    if (!mod) throw new Error('Storage module not found')
    this.storage = mod as unknown as Storage

    this.unsubscribers.push(
      this.kernel!.on('project:created', () => this.render()),
      this.kernel!.on('project:deleted', () => this.render()),
      this.kernel!.on('document:created', () => this.render()),
      this.kernel!.on('document:deleted', () => this.render()),
    )

    await this.render()
  }

  stop(): void {
    this.unsubscribers.forEach((fn) => fn())
    this.unsubscribers = []
    if (this.container) this.container.innerHTML = ''
  }

  destroy(): void {
    this.stop()
    this.kernel = null
    this.storage = null
    this.container = null
  }

  private async render(): Promise<void> {
    const container = this.container!
    container.innerHTML = ''

    container.appendChild(this.createToolbar())
    const projects = await this.storage!.listProjects()

    if (projects.length === 0) {
      container.appendChild(el('p', 'sidebar-empty', 'Нет проектов'))
      return
    }

    for (const project of projects) {
      container.appendChild(await this.createProjectItem(project))
    }
  }

  private createToolbar(): HTMLElement {
    const toolbar = el('div', 'sidebar-toolbar', '')
    toolbar.appendChild(el('button', 'sidebar-btn', '+ Новый проект', () => {
      this.promptCreateProject()
    }))
    return toolbar
  }

  private async createProjectItem(project: Project): Promise<HTMLElement> {
    const details = document.createElement('details')
    details.className = 'sidebar-project'
    details.open = true

    const summary = el('summary', 'sidebar-project-name', project.name)
    const delBtn = document.createElement('button')
    delBtn.className = 'sidebar-del-btn'
    delBtn.textContent = '✕'
    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation()
      if (confirm(`Удалить проект "${project.name}"?`)) {
        await this.storage!.deleteProject(project.id)
      }
    })
    summary.appendChild(delBtn)
    details.appendChild(summary)

    const docs = await this.storage!.listDocuments(project.id)
    const list = el('ul', 'sidebar-doc-list', '')
    for (const doc of docs) {
      const item = el('li', 'sidebar-doc-item', doc.name, () => {
        this.openDocument(doc)
      })
      const docDelBtn = document.createElement('button')
      docDelBtn.className = 'sidebar-del-btn'
      docDelBtn.textContent = '✕'
      docDelBtn.addEventListener('click', async (e) => {
        e.stopPropagation()
        if (confirm(`Удалить "${doc.name}"?`)) {
          await this.storage!.deleteDocument(doc.id)
        }
      })
      item.appendChild(docDelBtn)
      list.appendChild(item)
    }
    details.appendChild(list)

    details.appendChild(el('button', 'sidebar-btn sidebar-add-doc', '+ Документ', () => {
      this.promptCreateDocument(project.id)
    }))

    return details
  }

  private async promptCreateProject(): Promise<void> {
    const name = prompt('Название проекта:')
    if (name && name.trim()) {
      await this.storage!.createProject(name.trim())
    }
  }

  private async promptCreateDocument(projectId: string): Promise<void> {
    const name = prompt('Имя файла (например, глава-1.md):')
    if (name && name.trim()) {
      await this.storage!.createDocument(projectId, name.trim())
    }
  }

  private async openDocument(doc: StoredDocument): Promise<void> {
    this.kernel!.emit('editor:load', {
      documentId: doc.id,
      text: doc.content,
      name: doc.name,
    })
  }
}
