# STROČKA

Modular editor for writers. One kernel spec — many platform implementations.

## Quick start

```bash
cd kernels/typescript
npm install
npm test
```

## Architecture

- **Kernel** — thin event dispatcher (register/emit/on/start/stop/destroy)
- **Modules** — self-contained features (editor, storage, git, export)
- **Platforms** — PWA, JavaFX desktop, Tauri, mobile

See [KERNEL_SPEC.md](KERNEL_SPEC.md) and [docs/architecture.md](docs/architecture.md).

## Project structure

```
strochka/
  KERNEL_SPEC.md              Kernel contract
  kernels/typescript/         Reference implementation
  modules/editor/             CodeMirror 6 wrapper
  modules/storage/            File persistence
  modules/git/                Version control
  modules/export/             PDF/DOCX/EPUB generation
  platforms/pwa/              Progressive Web App
  tests/conformance/          Cross-platform test suite
  docs/                       Documentation
```

## License

AGPL v3
