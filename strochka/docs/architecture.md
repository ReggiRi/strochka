# STROČKA Architecture

## Overview

STROČKA is a modular document editor built on a multi-kernel architecture.
One specification defines the kernel contract; each platform implements it in its native language.

```
┌──────────────────────────────────────────────┐
│                  Modules                      │
│  editor  │  storage  │  git  │  export        │
└──────────┴──────────┴───────┴────────────────┘
       ▲          ▲        ▲          ▲
       └──────────┼────────┼──────────┘
                  │  events │
         ┌───────┴─────────┴───────┐
         │       Kernel            │
         │  register / emit / on   │
         │  start / stop / destroy │
         └─────────────────────────┘
                  │
         ┌───────┴─────────┐
         │   Platform      │
         │  PWA / JavaFX   │
         │  / Tauri        │
         └─────────────────┘
```

## Kernel

The kernel is a thin event dispatcher (~150 lines). It manages:
- **Module registration** — modules register with dependencies
- **Lifecycle** — `init → start → stop → destroy`
- **Event bus** — pub/sub with sequential async handlers
- **Error isolation** — one module cannot crash another

All kernels implement the same contract (`KERNEL_SPEC.md`).

### Lifecycle

```
constructor → register() → start() → stop() → destroy()
                 │                        │
                 ▼                        ▼
           init() → start()          stop() → destroy()
```

## Modules

Modules are self-contained features that communicate via events.
A module never calls another module directly.

| Module | Purpose | Dependencies |
|--------|---------|-------------|
| editor | CodeMirror 6 wrapper | none |
| storage | File persistence | none |
| git | Version control | storage |
| export | PDF/DOCX/EPUB generation | editor |

## Platforms

Each platform is a full application with:
1. A kernel in the platform's language (or shared TypeScript)
2. A WebView for the editor UI
3. Platform-specific storage and git implementations

## Events

Modules communicate through a typed event bus.
Events are the only contract between modules.

```
editor:changed ──────▶ storage:saves file
editor:changed ──────▶ preview:renders HTML
git:commit     ──────▶ ui:toast shows success
```

## Conformance

Every kernel implementation must pass the conformance test suite
(`tests/conformance/test-suite.json`). This guarantees that modules
work identically across all platforms.
