# STROČKA Kernel Specification v1.0

## Contract

```yaml
Kernel:
  lifecycle:
    - constructor()
    - register(modules)
    - start()
    - stop()
    - destroy()

  methods:
    register(module: Module): Promise<void>
    emit(event: string, eventPayload: object): Promise<void>
    on(event: string, handler: Handler): Unsubscribe
    off(event: string, handler: Handler): void
    start(): Promise<void>
    stop(): Promise<void>
    destroy(): void
```

### Behavior

**Async:** `emit()` returns a Promise that resolves after all handlers complete.
Handlers may be async. Execution is sequential, in subscription order.
`on()` and `off()` are synchronous.

**Lifecycle:**
- `register()` adds a module but does not activate it.
- `start()` calls `init()` then `start()` on each module in registration order.
- `stop()` calls `stop()` then `destroy()` in reverse order.
- `destroy()` clears all subscriptions and modules.
- Calling `register()` after `start()` activates the module immediately.

**Error handling:** An error in one module does not crash the kernel.
The kernel logs the error and continues. The module is marked as `error`.
`emit()` always resolves, even if handlers throw.

**Subscriptions:** `on()` returns an `Unsubscribe` function.
Re-subscribing the same handler is idempotent.

**Validation:** Modules must not trust data from `emit()` — each module validates incoming data itself. The kernel does not filter or sanitize event content.

## Module contract

```yaml
Module:
  properties:
    name: string              # Unique name
    version: string           # Semver
    dependencies: string[]    # Module names this depends on

  methods:
    init(kernel: Kernel): void | Promise<void>
    start(): void | Promise<void>
    stop(): void | Promise<void>
    destroy(): void | Promise<void>
```

## Events

Operational events include `success: boolean` and `error?: string`.

```yaml
Events:
  editor:changed      { text: string, documentId: string, source?: string }
  editor:focused      { documentId: string }
  editor:mode         { mode: "markdown" | "preview" | "html" }

  file:opened         { path: string, content: string }
  file:saved          { path: string, content: string, success: boolean }
  file:closed         { path: string }
  file:deleted        { path: string, success: boolean }

  project:opened      { path: string, files: FileEntry[] }
  project:closed      {}
  project:created     { name: string, path: string, success: boolean }

  git:commit          { message: string, success: boolean }
  git:history         { commits: CommitInfo[] }
  git:diff            { oldHash: string, newHash: string, path: string }
  git:sync            { remote: string, success: boolean }
  git:status          { status: SyncStatus }

  export:pdf          { profile: string, path: string, success: boolean }
  export:docx         { profile: string, path: string, success: boolean }
  export:epub         { profile: string, path: string, success: boolean }

  ui:theme            { theme: "light" | "dark" | "auto" }
  ui:toast            { message: string, type: "info" | "error" | "success" }
  ui:modal            { id: string, action: "open" | "close" }

  kernel:ready        {}
  kernel:error        { module: string, error: string }
  kernel:stopped      {}
```

This is the constitution. Every kernel implements this contract.
