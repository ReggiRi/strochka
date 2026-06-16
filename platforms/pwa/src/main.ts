/**
 * STROČKA PWA — точка входа.
 *
 * Создаёт ядро, регистрирует модули, запускает приложение.
 *
 * Использование:
 *   npm run dev    — режим разработки
 *   npm run build  — production-сборка
 */

import '../../../modules/editor/styles.css'
import '../../../modules/sidebar/sidebar.css'

import { KernelImpl } from '../../../kernels/typescript/src/kernel.js'
import { EditorModule } from '../../../modules/editor/editor.js'
import { PreviewModule } from '../../../modules/editor/preview.js'
import { StorageModule } from '../../../modules/storage/storage-indexeddb.js'
import { SidebarModule } from '../../../modules/sidebar/sidebar.js'

async function main(): Promise<void> {
  const kernel = new KernelImpl()

  const editor = new EditorModule()
  const storage = new StorageModule()

  kernel.register(editor)
  kernel.register(new PreviewModule())
  kernel.register(storage)
  kernel.register(new SidebarModule())

  let saveTimer: ReturnType<typeof setTimeout> | null = null

  kernel.on('editor:load', (eventPayload: unknown) => {
    if (saveTimer) clearTimeout(saveTimer)
    const payload = eventPayload as { documentId: string; text: string }
    editor.setContent(payload.text)
    editor.setDocumentId(payload.documentId)
    editor.focus()
  })

  kernel.on('editor:changed', (eventPayload: unknown) => {
    const payload = eventPayload as { documentId: string; text: string }
    if (!payload.documentId) return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(async () => {
      try {
        await storage.updateDocument(payload.documentId, payload.text)
      } catch (e) {
        console.error('[strochka] Auto-save failed:', e)
      }
    }, 500)
  })

  kernel.on('kernel:error', (eventPayload: unknown) => {
    const payload = eventPayload as { module: string; error: string }
    console.error(`[strochka] Module "${payload.module}" error: ${payload.error}`)
  })

  await kernel.start()

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
  }
}

main().catch((error) => {
  console.error('Failed to start STROČKA:', error)
  document.getElementById('app')!.innerHTML =
    `<p style="color:red;padding:2rem;">Failed to start: ${(error as Error).message}</p>`
})
