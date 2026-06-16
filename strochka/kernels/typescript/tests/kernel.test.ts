import { describe, it, expect, vi } from 'vitest'
import { KernelImpl } from '../src/kernel.js'
import type { Module } from '../src/kernel.js'

/**
 * Создаёт тестовый модуль с vi.fn() на всех методах жизненного цикла.
 * Позволяет переопределить любое поле через overrides.
 *
 * @param name — уникальное имя модуля
 * @param overrides — частичное переопределение полей модуля (например, init с ошибкой)
 * @returns Module с vi.fn() на init/start/stop/destroy
 */
function createTestModule(name: string, overrides: Partial<Module> = {}): Module {
  return {
    name,
    version: '1.0.0',
    dependencies: [],
    init: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    destroy: vi.fn(),
    ...overrides,
  }
}

describe('KernelImpl', () => {
  describe('register', () => {
    it('adds a module', async () => {
      const kernel = new KernelImpl()
      const module = createTestModule('alpha')
      await kernel.register(module)
    })

    it('rejects duplicate module names', async () => {
      const kernel = new KernelImpl()
      await kernel.register(createTestModule('dup'))
      await expect(kernel.register(createTestModule('dup'))).rejects.toThrow('already registered')
    })

    it('rejects module with missing dependency', async () => {
      const kernel = new KernelImpl()
      await expect(
        kernel.register(createTestModule('needy', { dependencies: ['phantom'] }))
      ).rejects.toThrow('depends on missing')
    })
  })

  describe('emit and on', () => {
    it('calls handler with data', async () => {
      const kernel = new KernelImpl()
      const handler = vi.fn()
      kernel.on('test:ping', handler)
      await kernel.emit('test:ping', { value: 42 })
      expect(handler).toHaveBeenCalledWith({ value: 42 })
    })

    it('does nothing when no handlers', async () => {
      const kernel = new KernelImpl()
      await expect(kernel.emit('test:nobody', {})).resolves.toBeUndefined()
    })

    it('calls multiple handlers in subscription order', async () => {
      const kernel = new KernelImpl()
      const order: string[] = []
      kernel.on('test:order', () => { order.push('first') })
      kernel.on('test:order', () => { order.push('second') })
      await kernel.emit('test:order', {})
      expect(order).toEqual(['first', 'second'])
    })
  })

  describe('off', () => {
    it('removes a handler', async () => {
      const kernel = new KernelImpl()
      const handler = vi.fn()
      kernel.on('test:gone', handler)
      kernel.off('test:gone', handler)
      await kernel.emit('test:gone', {})
      expect(handler).not.toHaveBeenCalled()
    })

    it('unsubscribe returned from on() removes handler', async () => {
      const kernel = new KernelImpl()
      const handler = vi.fn()
      const unsub = kernel.on('test:unsub', handler)
      unsub()
      await kernel.emit('test:unsub', {})
      expect(handler).not.toHaveBeenCalled()
    })
  })

  describe('lifecycle', () => {
    it('start calls init then start on modules', async () => {
      const kernel = new KernelImpl()
      const module = createTestModule('live')
      await kernel.register(module)
      await kernel.start()
      expect(module.init).toHaveBeenCalledOnce()
      expect(module.start).toHaveBeenCalledOnce()
    })

    it('start emits kernel:ready', async () => {
      const kernel = new KernelImpl()
      const handler = vi.fn()
      kernel.on('kernel:ready', handler)
      await kernel.register(createTestModule('a'))
      await kernel.start()
      expect(handler).toHaveBeenCalledOnce()
    })

    it('stop calls stop then destroy in reverse order', async () => {
      const kernel = new KernelImpl()
      const order: string[] = []
      const a = createTestModule('a', {
        stop: vi.fn().mockImplementation(() => { order.push('stop:a') }),
        destroy: vi.fn().mockImplementation(() => { order.push('destroy:a') }),
      })
      const b = createTestModule('b', {
        stop: vi.fn().mockImplementation(() => { order.push('stop:b') }),
        destroy: vi.fn().mockImplementation(() => { order.push('destroy:b') }),
      })
      await kernel.register(a)
      await kernel.register(b)
      await kernel.start()
      await kernel.stop()
      expect(order).toEqual(['stop:b', 'stop:a', 'destroy:b', 'destroy:a'])
    })

    it('stop emits kernel:stopped', async () => {
      const kernel = new KernelImpl()
      const handler = vi.fn()
      kernel.on('kernel:stopped', handler)
      await kernel.register(createTestModule('x'))
      await kernel.start()
      await kernel.stop()
      expect(handler).toHaveBeenCalledOnce()
    })

    it('rejects double start', async () => {
      const kernel = new KernelImpl()
      await kernel.register(createTestModule('x'))
      await kernel.start()
      await expect(kernel.start()).rejects.toThrow('already started')
    })

    it('can start again after stop', async () => {
      const kernel = new KernelImpl()
      const module = createTestModule('cycle')
      await kernel.register(module)
      await kernel.start()
      await kernel.stop()
      await kernel.start()
      expect(module.init).toHaveBeenCalledTimes(2)
      expect(module.start).toHaveBeenCalledTimes(2)
    })
  })

  describe('error handling', () => {
    it('handler error does not crash kernel', async () => {
      const kernel = new KernelImpl()
      kernel.on('test:boom', () => { throw new Error('handler fail') })
      const handler2 = vi.fn()
      kernel.on('test:boom', handler2)
      await expect(kernel.emit('test:boom', {})).resolves.toBeUndefined()
      expect(handler2).toHaveBeenCalled()
    })

    it('module init error marks module as error', async () => {
      const kernel = new KernelImpl()
      const errorHandler = vi.fn()
      kernel.on('kernel:error', errorHandler)
      const module = createTestModule('faulty', { init: vi.fn().mockRejectedValue(new Error('init fail')) })
      await kernel.register(module)
      await kernel.start()
      expect(errorHandler).toHaveBeenCalledWith(
        expect.objectContaining({ module: 'faulty' })
      )
    })

    it('module start error marks module as error', async () => {
      const kernel = new KernelImpl()
      const module = createTestModule('badstart', { start: vi.fn().mockRejectedValue(new Error('start fail')) })
      await kernel.register(module)
      await kernel.start()
    })
  })

  describe('register after start', () => {
    it('activates module immediately', async () => {
      const kernel = new KernelImpl()
      await kernel.register(createTestModule('early'))
      await kernel.start()
      const late = createTestModule('late')
      await kernel.register(late)
      expect(late.init).toHaveBeenCalled()
      expect(late.start).toHaveBeenCalled()
    })
  })

  describe('destroy', () => {
    it('clears all modules and handlers', async () => {
      const kernel = new KernelImpl()
      await kernel.register(createTestModule('a'))
      const handler = vi.fn()
      kernel.on('test:x', handler)
      kernel.destroy()
      await expect(kernel.register(createTestModule('a'))).resolves.toBeUndefined()
      await kernel.emit('test:x', {})
      expect(handler).not.toHaveBeenCalled()
    })
  })
})
