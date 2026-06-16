/**
 * STROČKA Preview Module — рендер Markdown в HTML.
 *
 * Подписывается на editor:changed и обновляет превью.
 * Использует DOMPurify для защиты от XSS.
 *
 * @rationale marked выбран за скорость (самый быстрый Markdown-парсер на JS).
 * DOMPurify обязателен — контент пользователя не должен выполняться как HTML.
 */

import { marked } from 'marked'
import DOMPurify from 'dompurify'
import type { Kernel, Module } from '../../kernels/typescript/src/kernel.js'

/**
 * Модуль превью Markdown.
 *
 * Слушает editor:changed, рендерит HTML и вставляет в DOM.
 * XSS-защита: DOMPurify санитизирует HTML перед вставкой.
 */
export class PreviewModule implements Module {
  name = 'preview'
  version = '1.0.0'
  dependencies: string[] = ['editor']

  private kernel: Kernel | null = null
  private previewContainer: HTMLElement | null = null
  private unsubscribe: (() => void) | null = null
  private currentHtml = ''

  /**
   * Инициализация: находит контейнер #preview-container в DOM.
   *
   * @param kernel — ядро STROČKA
   *
   * @throws Error если контейнер #preview-container не найден
   */
  init(kernel: Kernel): void {
    this.kernel = kernel
    const container = document.getElementById('preview-container')
    if (!container) {
      throw new Error('Preview container #preview-container not found in DOM')
    }
    this.previewContainer = container
  }

  /**
   * Запуск: подписывается на editor:changed.
   * При каждом изменении рендерит Markdown и обновляет DOM.
   *
   * @rationale Используем innerHTML, а не createElement, потому что marked
   * возвращает строку. DOMPurify — единственная защита перед вставкой.
   */
  start(): void {
    if (!this.kernel || !this.previewContainer) return

    this.unsubscribe = this.kernel.on('editor:changed', async (eventPayload: unknown) => {
      const payload = eventPayload as { text: string }
      const rawHtml = await marked.parse(payload.text)

      /**
       * WARNING: XSS-защита. Никогда не удалять DOMPurify.
       * DOMPurify санитизирует HTML, удаляя скрипты, event-хендлеры
       * и другие опасные конструкции.
       *
       * @time O(n) — санитизация пропорциональна размеру HTML
       */
      const sanitizedHtml = DOMPurify.sanitize(rawHtml, {
        ALLOWED_TAGS: [
          'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
          'p', 'br', 'hr',
          'ul', 'ol', 'li',
          'strong', 'em', 'del', 'ins', 'code', 'pre',
          'blockquote', 'sup', 'sub',
          'a', 'img',
          'table', 'thead', 'tbody', 'tr', 'th', 'td',
          'dl', 'dt', 'dd',
        ],
        ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'target'],
      })

      if (sanitizedHtml !== this.currentHtml) {
        this.previewContainer!.innerHTML = sanitizedHtml
        this.currentHtml = sanitizedHtml
      }
    })
  }

  /**
   * Остановка: отписывается от событий и очищает превью.
   */
  stop(): void {
    this.unsubscribe?.()
    this.unsubscribe = null
    if (this.previewContainer) {
      this.previewContainer.innerHTML = ''
    }
    this.currentHtml = ''
  }

  /**
   * Уничтожение: полная очистка.
   */
  destroy(): void {
    this.stop()
    this.kernel = null
    this.previewContainer = null
  }
}
