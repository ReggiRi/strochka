/**
 * STROČKA PWA — точка входа.
 *
 * Создаёт ядро, регистрирует модули редактора и превью,
 * запускает приложение.
 *
 * Использование:
 *   npm run dev    — режим разработки
 *   npm run build  — production-сборка
 */

import { KernelImpl } from '../../../kernels/typescript/src/kernel.js'
import { EditorModule } from '../../../modules/editor/editor.js'
import { PreviewModule } from '../../../modules/editor/preview.js'
import { StorageModule } from '../../../modules/storage/storage-indexeddb.js'
import { SidebarModule } from '../../../modules/sidebar/sidebar.js'

async function main(): Promise<void> {
  const kernel = new KernelImpl()

  kernel.on('kernel:ready', () => {
    console.log('STROČKA kernel ready')
  })

  kernel.on('kernel:error', (eventPayload: unknown) => {
    const payload = eventPayload as { module: string; error: string }
    console.error(`[strochka] Module "${payload.module}" error: ${payload.error}`)
  })

  kernel.register(new EditorModule())
  kernel.register(new PreviewModule())
  kernel.register(new StorageModule())
  kernel.register(new SidebarModule())

  await kernel.start()
}

main().catch((error) => {
  console.error('Failed to start STROČKA:', error)
  document.getElementById('app')!.innerHTML =
    `<p style="color:red;padding:2rem;">Failed to start: ${(error as Error).message}</p>`
})
