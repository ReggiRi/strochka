/**
 * STROČKA Editor Module — обёртка над CodeMirror 6.
 *
 * Реализует контракт Module из KERNEL_SPEC.md.
 * Испускает editor:changed при каждом изменении текста.
 *
 * @rationale Используется CodeMirror 6, а не ProseMirror или Tiptap,
 * потому что целевой контент — Markdown (не Rich Text).
 * CodeMirror 6 минимален, модулен и не тянет лишних зависимостей.
 */

import { EditorView, basicSetup } from 'codemirror'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { keymap } from '@codemirror/view'
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import type { Kernel, Module } from '../../kernels/typescript/src/kernel.js'

/**
 * Создаёт расширение CodeMirror, которое испускает editor:changed
 * при каждом изменении документа.
 *
 * @param kernel — ссылка на ядро для emit событий
 * @param documentId — идентификатор текущего документа
 *
 * @rationale Используем DispatchTransaction вместо updateListener,
 * чтобы иметь доступ к полному документу после каждого изменения.
 *
 * @time O(n) — сериализация документа в строку при каждом изменении
 */
function createChangeDispatcher(kernel: Kernel, documentId: () => string) {
  return EditorView.updateListener.of((update) => {
    if (update.docChanged) {
      const text = update.state.doc.toString()
      kernel.emit('editor:changed', {
        text,
        documentId: documentId(),
        source: 'user',
      })
    }
  })
}

/**
 * Модуль редактора на CodeMirror 6.
 *
 * @rationale Модуль создаёт и управляет экземпляром CodeMirror.
 * Жизненный цикл: в init() регистрируем DOM-контейнер,
 * в start() создаём редактор, в stop() уничтожаем.
 */
export class EditorModule implements Module {
  name = 'editor'
  version = '1.0.0'
  dependencies: string[] = []

  private kernel: Kernel | null = null
  private view: EditorView | null = null
  private containerElement: HTMLElement | null = null
  private currentDocumentId = 'untitled'

  /**
   * Инициализация: сохраняет ссылку на ядро и находит контейнер в DOM.
   *
   * @param kernel — ядро STROČKA для подписки на события
   *
   * @throws Error если контейнер #editor-container не найден в DOM
   */
  init(kernel: Kernel): void {
    this.kernel = kernel
    const container = document.getElementById('editor-container')
    if (!container) {
      throw new Error('Editor container #editor-container not found in DOM')
    }
    this.containerElement = container
  }

  /**
   * Запуск: создаёт экземпляр CodeMirror 6.
   * Регистрирует подписку на editor:mode для смены режима.
   */
  start(): void {
    if (!this.kernel || !this.containerElement) return

    const kernel = this.kernel
    const getDocumentId = () => this.currentDocumentId

    const state = EditorState.create({
      doc: '',
      extensions: [
        basicSetup,
        markdown({ base: markdownLanguage }),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        createChangeDispatcher(kernel, getDocumentId),
      ],
    })

    this.view = new EditorView({
      state,
      parent: this.containerElement,
    })

    this.kernel.on('editor:mode', (eventPayload: unknown) => {
      const payload = eventPayload as { mode: string }
      if (payload.mode === 'preview') {
        this.containerElement?.classList.add('hidden')
      } else {
        this.containerElement?.classList.remove('hidden')
      }
    })
  }

  /**
   * Возвращает текущее содержимое редактора.
   *
   * @returns строка с Markdown-контентом
   */
  getContent(): string {
    if (!this.view) return ''
    return this.view.state.doc.toString()
  }

  /**
   * Устанавливает содержимое редактора.
   * Сбрасывает историю изменений.
   *
   * @param text — новый Markdown-контент
   */
  setContent(text: string): void {
    if (!this.view) return
    const transaction = this.view.state.update({
      changes: {
        from: 0,
        to: this.view.state.doc.length,
        insert: text,
      },
    })
    this.view.dispatch(transaction)
  }

  /**
   * Устанавливает идентификатор текущего документа.
   *
   * @param documentId — новый идентификатор
   */
  setDocumentId(documentId: string): void {
    this.currentDocumentId = documentId
  }

  /**
   * Устанавливает фокус на редакторе.
   */
  focus(): void {
    this.view?.focus()
  }

  /**
   * Остановка: уничтожает экземпляр CodeMirror и очищает контейнер.
   */
  stop(): void {
    this.view?.destroy()
    this.view = null
    if (this.containerElement) {
      this.containerElement.innerHTML = ''
    }
  }

  /**
   * Уничтожение: полная очистка.
   */
  destroy(): void {
    this.stop()
    this.kernel = null
    this.containerElement = null
  }
}
