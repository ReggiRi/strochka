# STROČKA Project Map

## Tree

```
strochka/
├── KERNEL_SPEC.md              # Kernel contract (constitution)
├── README.md                   # Quick start
├── .directory.md               # This folder
│
├── kernels/typescript/
│   ├── .directory.md
│   ├── src/kernel.ts           # Reference implementation
│   ├── tests/kernel.test.ts    # Unit tests (19)
│   ├── package.json
│   └── tsconfig.json
│
├── tests/conformance/
│   ├── .directory.md
│   ├── test-suite.json         # 13 cross-platform scenarios
│   └── runner.ts               # TypeScript runner
│
└── docs/
    ├── .directory.md
    ├── architecture.md         # Architecture overview
    └── contributing.md         # Contribution guide
```

## Dependency Graph

- `KERNEL_SPEC.md` — no dependencies (root contract)
- `kernels/typescript/src/kernel.ts` — implements `KERNEL_SPEC.md`
- `kernels/typescript/tests/kernel.test.ts` — depends on `kernel.ts`
- `tests/conformance/test-suite.json` — no dependencies (lang-agnostic)
- `tests/conformance/runner.ts` — depends on `kernel.ts` and `test-suite.json`
- `docs/architecture.md` — documents `kernel.ts` and `KERNEL_SPEC.md`
- `docs/contributing.md` — documents project conventions

## Change Index

| File changed | Potentially affected |
|---|---|
| `KERNEL_SPEC.md` | All kernel implementations, conformance tests, architecture docs |
| `kernels/typescript/src/kernel.ts` | kernel.test.ts, runner.ts, architecture.md |
| `tests/conformance/test-suite.json` | runner.ts, all kernel implementations |
| `tests/conformance/runner.ts` | test-suite.json |
| `docs/architecture.md` | contributing.md |
