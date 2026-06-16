# Contributing to STROČKA

## Principles

1. **One spec, many kernels** — never change the kernel contract for one platform
2. **Events are the API** — modules communicate only through events
3. **Error isolation** — a crash in one module never takes down the kernel
4. **Conformance first** — all kernels pass the same test suite

## Development workflow

### Phase 0: Kernel & tests

```bash
# Install dependencies
cd kernels/typescript
npm install

# Run kernel tests
npm test

# Run conformance suite
npx vitest run tests/conformance/runner.ts
```

### Adding a new module

1. Define the events it emits and listens to
2. Implement the Module interface
3. Register it with the kernel
4. Write tests

### Adding a new kernel (platform)

1. Implement the Kernel interface from `KERNEL_SPEC.md`
2. Implement the Module interface
3. Create a conformance test runner for your language
4. Make all conformance tests pass

## Code conventions

- TypeScript: strict mode, ES2022 target
- Functions ≤ 30 lines
- No abbreviations in names (no `i`, `tmp`, `data`, `res`)
- JSDoc on all public APIs
- Tests cover: positive, negative, and edge cases

## Commit messages

Use Conventional Commits:
```
feat: add PDF export module
fix: handle empty document in preview
test: add conformance tests for lifecycle
docs: update architecture diagram
```

## Pull request checklist

- [ ] Conformance tests pass
- [ ] New code has tests
- [ ] Public APIs are documented
- [ ] No secrets in code
- [ ] No TODOs without issue references
