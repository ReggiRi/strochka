/**
 * Signature for event handler functions registered via `on()`.
 * May be synchronous or asynchronous.
 *
 * @param eventPayload — данные, переданные в `emit()`. Модуль-получатель сам валидирует структуру.
 * @returns void или Promise<void> — ядро ожидает завершения асинхронных хендлеров.
 *
 * @rationale Параметр назван eventPayload, а не data, чтобы избежать зарезервированного имени.
 * @time O(1) — вызов функции, сложность зависит от реализации хендлера.
 */
type Handler = (eventPayload: unknown) => void | Promise<unknown>

/**
 * Функция, возвращаемая `on()`. Вызов отписывает хендлер от события.
 *
 * @rationale Паттерн «Unsubscribe» из pub/sub: подписка и отписка через один объект,
 * без необходимости хранить ссылку на хендлер для последующей off().
 */
type Unsubscribe = () => void

/**
 * Статус модуля в жизненном цикле ядра.
 *
 * - `registered` — модуль зарегистрирован, но не активирован
 * - `active` — модуль прошёл init() и start()
 * - `error` — init() или start() бросили исключение
 * - `stopped` — модуль остановлен через stop()
 */
type ModuleStatus = 'registered' | 'active' | 'error' | 'stopped'

/**
 * Публичный контракт ядра STROČKA.
 * Все платформы реализуют этот интерфейс.
 */
interface Kernel {
  /**
   * Регистрирует модуль в ядре. Если ядро уже запущено, модуль активируется сразу.
   *
   * @param module — модуль, реализующий интерфейс Module
   * @throws Error если модуль с таким именем уже зарегистрирован
   * @throws Error если зависимость модуля не найдена
   *
   * @rationale Валидация зависимостей на этапе регистрации, а не старта —
   * чтобы ошибка конфигурации проявилась как можно раньше.
   * @time O(n) — проверка каждой зависимости модуля
   */
  register(module: Module): Promise<void>

  /**
   * Испускает событие. Все подписанные хендлеры вызываются последовательно.
   * Ошибка в одном хендлере не прерывает остальные.
   *
   * @param event — имя события (строка, namespaced через ':')
   * @param eventPayload — произвольные данные, передаваемые хендлерам
   *
   * @rationale Последовательное выполнение гарантирует детерминированный порядок обработки.
   * try-catch вокруг каждого хендлера реализует принцип изоляции ошибок.
   * @time O(n) — вызов каждого подписанного хендлера
   */
  emit(event: string, eventPayload: unknown): Promise<void>

  /**
   * Подписывается на событие. При повторной подписке того же хендлера ничего не происходит.
   *
   * @param event — имя события
   * @param handler — функция-обработчик
   * @returns Unsubscribe — вызовите для отписки

   * @rationale Дедупликация хендлеров предотвращает двойную обработку при случайной
   * повторной подписке.
   * @time O(1) амортизированно — добавление в конец массива
   */
  on(event: string, handler: Handler): Unsubscribe

  /**
   * Отписывает хендлер от события. Если хендлер не найден, ничего не делает.
   *
   * @param event — имя события
   * @param handler — ранее подписанный обработчик
   *
   * @time O(n) — поиск хендлера в массиве
   */
  off(event: string, handler: Handler): void

  /**
   * Запускает ядро: инициализирует и стартует все зарегистрированные модули.
   * Вызывает `init()` на всех модулях, затем `start()` на всех.
   * После успешного запуска испускает `kernel:ready`.
   *
   * @throws Error если ядро уже запущено
   *
   * @rationale Две фазы (сначала все init, потом все start) гарантируют,
   * что каждый модуль может найти другие модули через ядро до их активации.
   * @time O(m) — обработка каждого модуля
   */
  start(): Promise<void>

  /**
   * Останавливает ядро: вызывает `stop()` на всех активных модулях,
   * затем `destroy()`. В обратном порядке регистрации.
   * Испускает `kernel:stopped`.
   *
   * @rationale Два прохода: сначала все stop(), потом все destroy() —
   * чтобы каждый модуль мог корректно завершить работу до того,
   * как другие модули начнут освобождать ресурсы.
   * @time O(m) — обработка каждого модуля
   */
  stop(): Promise<void>

  /**
   * Возвращает зарегистрированный модуль по имени.
   *
   * @param name — имя модуля
   * @returns модуль или undefined если не найден
   *
   * @rationale Прямой доступ к модулю нужен, когда один модуль вызывает
   * методы другого (например, sidebar вызывает Storage.CRUD).
   * @time O(1) — поиск в Map
   */
  getModule<T extends Module>(name: string): T | undefined

  /**
   * Уничтожает ядро: очищает все подписки и удаляет все модули.
   * Безопасно вызывать в любом состоянии.
   *
   * @rationale Полная очистка нужна для тестов и перезапуска без создания нового экземпляра.
   * @time O(1) амортизированно — очистка Map
   */
  destroy(): void
}

/**
 * Контракт модуля STROČKA.
 * Каждый модуль реализует жизненный цикл: init → start → stop → destroy.
 */
interface Module {
  /** Уникальное имя модуля. Должно совпадать с именем при регистрации. */
  name: string
  /** Версия модуля в формате semver. */
  version: string
  /** Имена модулей, от которых этот модуль зависит. */
  dependencies: string[]

  /**
   * Инициализация модуля. Вызывается после регистрации всех зависимостей.
   * На этом этапе модуль регистрирует подписки на события.
   *
   * @param kernel — ссылка на ядро для подписки на события
   *
   * @rationale init() отделён от start(), чтобы модуль мог зарегистрировать хендлеры
   * до того, как начнут приходить события.
   */
  init(kernel: Kernel): void | Promise<void>

  /**
   * Запуск модуля. Модуль начинает активную работу.
   *
   * @rationale Разделение init/start позволяет подписаться на события в init,
   * но начать генерацию событий только после start().
   */
  start(): void | Promise<void>

  /**
   * Остановка модуля. Модуль прекращает активную работу, но сохраняет состояние.
   */
  stop(): void | Promise<void>

  /**
   * Уничтожение модуля. Модуль освобождает все ресурсы.
   */
  destroy(): void | Promise<void>
}

/**
 * Reference implementation ядра STROČKA на TypeScript.
 *
 * Реализует контракт Kernel из KERNEL_SPEC.md.
 * Используется как эталон для проверки модулей и тестирования конформности.
 *
 * @rationale Выбран Map для хранения модулей и хендлеров:
 * - гарантирует порядок вставки (ES6+)
 * - O(1) доступ по ключу
 * - итерация в порядке вставки для детерминированного поведения
 */
class KernelImpl implements Kernel {
  private modules = new Map<string, { module: Module; status: ModuleStatus }>()
  private handlers = new Map<string, Handler[]>()
  private started = false

  /**
   * @time O(n) — проверка каждой зависимости модуля
   */
  async register(module: Module): Promise<void> {
    if (this.modules.has(module.name)) {
      throw new Error(`Module "${module.name}" is already registered`)
    }
    for (const dependencyName of module.dependencies) {
      if (!this.modules.has(dependencyName)) {
        throw new Error(`Module "${module.name}" depends on missing module "${dependencyName}"`)
      }
    }
    this.modules.set(module.name, { module, status: 'registered' })
    if (this.started) {
      await this.initModule(module)
      await this.startModule(module)
    }
  }

  /**
   * @time O(n) — вызов каждого подписанного хендлера
   */
  async emit(event: string, eventPayload: unknown): Promise<void> {
    const handlers = this.handlers.get(event)
    if (!handlers) return
    for (const handler of handlers) {
      try {
        await handler(eventPayload)
      } catch (error) {
        console.error(`[kernel] Error in handler for "${event}":`, error)
      }
    }
  }

  /**
   * @time O(1) амортизированно
   */
  on(event: string, handler: Handler): Unsubscribe {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, [])
    }
    const eventHandlers = this.handlers.get(event)!
    if (!eventHandlers.includes(handler)) {
      eventHandlers.push(handler)
    }
    return () => this.off(event, handler)
  }

  /**
   * @time O(n) — поиск хендлера в массиве
   */
  off(event: string, handler: Handler): void {
    const eventHandlers = this.handlers.get(event)
    if (!eventHandlers) return
    const handlerIndex = eventHandlers.indexOf(handler)
    if (handlerIndex !== -1) eventHandlers.splice(handlerIndex, 1)
  }

  async start(): Promise<void> {
    if (this.started) throw new Error('Kernel is already started')
    this.started = true
    for (const { module } of this.modules.values()) {
      await this.initModule(module)
    }
    for (const { module } of this.modules.values()) {
      await this.startModule(module)
    }
    await this.emit('kernel:ready', {})
  }

  async stop(): Promise<void> {
    if (!this.started) return
    const reverseEntries = [...this.modules.values()].reverse()
    for (const { module, status } of reverseEntries) {
      if (status !== 'active') continue
      try {
        await module.stop()
      } catch (error) {
        console.error(`[kernel] Error stopping module "${module.name}":`, error)
      }
    }
    for (const { module, status } of reverseEntries) {
      if (status !== 'active') continue
      try {
        await module.destroy()
      } catch (error) {
        console.error(`[kernel] Error destroying module "${module.name}":`, error)
      }
      this.modules.set(module.name, { module, status: 'stopped' })
    }
    this.started = false
    await this.emit('kernel:stopped', {})
  }

  getModule<T extends Module>(name: string): T | undefined {
    return this.modules.get(name)?.module as T | undefined
  }

  destroy(): void {
    this.modules.clear()
    this.handlers.clear()
    this.started = false
  }

  private async initModule(module: Module): Promise<void> {
    try {
      await module.init(this)
      this.modules.set(module.name, { module, status: 'registered' })
    } catch (error) {
      this.modules.set(module.name, { module, status: 'error' })
      await this.emit('kernel:error', { module: module.name, error: String(error) })
    }
  }

  private async startModule(module: Module): Promise<void> {
    const moduleEntry = this.modules.get(module.name)!
    if (moduleEntry.status === 'error') return
    try {
      await module.start()
      this.modules.set(module.name, { module, status: 'active' })
    } catch (error) {
      this.modules.set(module.name, { module, status: 'error' })
      await this.emit('kernel:error', { module: module.name, error: String(error) })
    }
  }
}

export type { Kernel, Module, Handler, Unsubscribe, ModuleStatus }
export { KernelImpl }
