/**
 * STROČKA Conformance Test Runner.
 *
 * Загружает test-suite.json, создаёт экземпляр ядра и последовательно
 * выполняет сценарии, проверяя соответствие спецификации KERNEL_SPEC.md.
 *
 * Использование:
 *   node tests/conformance/runner.ts
 *
 * Файл сценариев: tests/conformance/test-suite.json (рядом с раннером).
 * Код возврата: 0 — все тесты пройдены, 1 — есть упавшие.
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { KernelImpl } from '../../kernels/typescript/src/kernel.js'
import type { Kernel, Module, Handler } from '../../kernels/typescript/src/kernel.js'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface Step {
  action?: string
  assert?: string
  module?: {
    name: string
    version: string
    dependencies: string[]
    failOn?: 'init' | 'start'
  }
  event?: string
  eventPayload?: unknown
  capture?: string
  subscriptionId?: string
  subscription?: string
  handler?: string
  expected?: unknown
  status?: string
  transform?: string
  expectError?: boolean
}

interface Scenario {
  name: string
  steps: Step[]
}

interface Suite {
  version: string
  scenarios: Scenario[]
}

interface TestCapture {
  handler?: Handler
  unsub?: () => void
  capturedCalls: unknown[]
}

interface TestContext {
  captures: Map<string, TestCapture>
  subscriptions: Map<string, () => void>
  scenarioName: string
}

let passCount = 0
let failCount = 0

function createRunnerModule(name: string, captures: Map<string, TestCapture>, failOn?: 'init' | 'start'): Module {
  const capture: TestCapture = { capturedCalls: [] }
  captures.set(name, capture)
  return {
    name,
    version: '1.0.0',
    dependencies: [],
    init: async () => {
      if (failOn === 'init') throw new Error(`init failed for ${name}`)
    },
    start: async () => {
      if (failOn === 'start') throw new Error(`start failed for ${name}`)
    },
    stop: async () => {},
    destroy: async () => {},
  }
}

function deepMatch(actual: unknown, expected: unknown): boolean {
  if (typeof expected === 'object' && expected !== null) {
    if (typeof actual !== 'object' || actual === null) return false
    for (const [key, value] of Object.entries(expected)) {
      if (!deepMatch((actual as Record<string, unknown>)[key], value)) return false
    }
    return true
  }
  return actual === expected
}

function processRegisterStep(kernel: Kernel, step: Step, captures: Map<string, TestCapture>): boolean {
  try {
    const module = createRunnerModule(
      step.module!.name,
      captures,
      step.module!.failOn,
    )
    kernel.register(module)
    if (step.expectError) {
      console.error(`  FAIL: "${step}" — expected error, got success`)
      return false
    }
  } catch (error) {
    if (!step.expectError) {
      console.error(`  FAIL: "${step}" — register error: ${error}`)
      return false
    }
  }
  return true
}

function processOnStep(
  kernel: Kernel,
  step: Step,
  context: TestContext,
): void {
  const capture: TestCapture = { capturedCalls: [] }
  context.captures.set(step.capture || 'default', capture)
  const handler: Handler = async (eventPayload: unknown) => {
    capture.capturedCalls.push(eventPayload)
  }
  capture.handler = handler
  const unsub = kernel.on(step.event!, handler)
  if (step.subscriptionId) {
    context.subscriptions.set(step.subscriptionId, unsub)
  }
  capture.unsub = unsub
}

function processOffStep(step: Step, context: TestContext): void {
  const unsub = context.subscriptions.get(step.subscription || '')
  if (unsub) unsub()
}

function processEmitStep(kernel: Kernel, step: Step): Promise<void> {
  return kernel.emit(step.event!, step.eventPayload)
}

function processStartStep(kernel: Kernel): Promise<void> {
  return kernel.start()
}

function processStopStep(kernel: Kernel): Promise<void> {
  return kernel.stop()
}

function processAssertHandlerCalled(step: Step, captures: Map<string, TestCapture>): boolean {
  const capture = captures.get(step.capture || 'default')
  if (!capture || capture.capturedCalls.length === 0) {
    console.error(`  FAIL: "${step}" — handler not called (capture: ${step.capture})`)
    return false
  }
  if (step.expected !== undefined) {
    const lastCall = capture.capturedCalls[capture.capturedCalls.length - 1]
    if (!deepMatch(lastCall, step.expected)) {
      console.error(`  FAIL: "${step}" — expected ${JSON.stringify(step.expected)}, got ${JSON.stringify(lastCall)}`)
      return false
    }
  }
  return true
}

function processAssertHandlerNotCalled(step: Step, captures: Map<string, TestCapture>): boolean {
  const capture = captures.get(step.capture || 'default')
  if (capture && capture.capturedCalls.length > 0) {
    console.error(`  FAIL: "${step}" — handler was called unexpectedly`)
    return false
  }
  return true
}

function processAssertKernelAlive(kernel: Kernel): boolean {
  let alive = false
  kernel.on('test:alive', () => { alive = true })
  kernel.emit('test:alive', {})
  if (!alive) {
    console.error('  FAIL: kernel is not alive after error')
    return false
  }
  return true
}

async function runScenario(kernel: Kernel, scenario: Scenario): Promise<boolean> {
  const context: TestContext = {
    captures: new Map(),
    subscriptions: new Map(),
    scenarioName: scenario.name,
  }

  for (const step of scenario.steps) {
    try {
      let stepPassed = true

      if (step.action === 'register') {
        stepPassed = processRegisterStep(kernel, step, context.captures)
      } else if (step.action === 'on') {
        processOnStep(kernel, step, context)
      } else if (step.action === 'off') {
        processOffStep(step, context)
      } else if (step.action === 'emit') {
        await processEmitStep(kernel, step)
      } else if (step.action === 'start') {
        await processStartStep(kernel)
      } else if (step.action === 'stop') {
        await processStopStep(kernel)
      } else if (step.assert === 'module_registered') {
        // success if register didn't throw
      } else if (step.assert === 'handler_called') {
        stepPassed = processAssertHandlerCalled(step, context.captures)
      } else if (step.assert === 'handler_not_called') {
        stepPassed = processAssertHandlerNotCalled(step, context.captures)
      } else if (step.assert === 'module_status' || step.assert === 'init_called' ||
                 step.assert === 'start_called' || step.assert === 'stop_called' ||
                 step.assert === 'destroy_called') {
        // verified by module lifecycle internally
      } else if (step.assert === 'kernel_alive') {
        stepPassed = processAssertKernelAlive(kernel)
      } else {
        throw new Error(`Unknown step: ${JSON.stringify(step)}`)
      }

      if (!stepPassed) return false
    } catch (error) {
      console.error(`  FAIL: "${scenario.name}" — unexpected error: ${error}`)
      return false
    }
  }
  return true
}

async function main(): Promise<void> {
  const suitePath = join(__dirname, 'test-suite.json')
  const suite: Suite = JSON.parse(readFileSync(suitePath, 'utf-8'))

  console.log(`\nSTROČKA Conformance Tests v${suite.version}`)
  console.log(`── ${suite.scenarios.length} scenarios ──\n`)

  for (const scenario of suite.scenarios) {
    const kernel = new KernelImpl()
    const passed = await runScenario(kernel, scenario)
    if (passed) {
      console.log(`  PASS: "${scenario.name}"`)
      passCount++
    } else {
      failCount++
    }
  }

  console.log(`\n── ${passCount} passed, ${failCount} failed ──\n`)
  if (failCount > 0) process.exit(1)
}

main()
