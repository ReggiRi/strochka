# STROČKA — Технический документ v3.0

## Мультиядерная архитектура

---

## 1. Общие положения

### 1.1. Название
**STROČKA**. Произносится «стро́чка». Č — славянская диакритика.

### 1.2. Принцип
**Одна спецификация — много реализаций.** Ядро-диспетчер описано контрактом. Каждая платформа получает ядро на своём языке. Модули переиспользуются.

### 1.3. Почему так
- Нет компромиссов между платформами.
- Каждое ядро — 50 строк на любом языке.
- Модули не зависят от языка ядра.
- Архитектура переживёт любой технологический стек.

---

## 2. Спецификация ядра (KERNEL_SPEC.md)

### 2.1. Контракт ядра

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

**Поведение:**
- **Асинхронность:** `emit()` возвращает Promise, резолвится после всех хендлеров. Хендлеры могут быть асинхронными. Выполнение — последовательное, в порядке подписки.
- **Жизненный цикл:** `register()` добавляет модуль, но не активирует. `start()` вызывает `init()` → `start()` на каждом модуле. `stop()` вызывает `stop()` → `destroy()` в обратном порядке. `destroy()` очищает подписки.
- **Ошибки:** ошибка в одном модуле не валит ядро. Ядро логирует и продолжает. Модуль помечается статусом `error`. `emit()` всегда резолвится, даже при падении хендлеров.
- **Подписка:** `on()` возвращает функцию `Unsubscribe` для отписки. Повторная подписка того же хендлера игнорируется.
- **Валидация:** Модули не должны доверять данным из `emit()` — каждый модуль сам валидирует входящие данные. Ядро не фильтрует и не санитизирует содержимое событий.

### 2.2. Контракт модуля

```yaml
Module:
  properties:
    name: string              # Уникальное имя
    version: string           # Семантиеский версионирование
    dependencies: string[]    # Имена модулей-зависимостей

  methods:
    init(kernel: Kernel): void | Promise<void>
    start(): void | Promise<void>
    stop(): void | Promise<void>
    destroy(): void | Promise<void>
```

### 2.3. События

Все события операций содержат `success: boolean` и `error?: string`.

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

**Это конституция.** ~80 строк. Ядро реализует контракт. Модули пишутся под него. Все платформы наследуют.

---

## 3. Структура репозитория (монорепо)

```
strochka/
  KERNEL_SPEC.md              # Спецификация ядра (конституция)
  README.md
  LICENSE                     # AGPL v3
  PROJECT_MAP.md              # Карта зависимостей (корень проекта)
  
  .directory.md               # Документация папки

  kernels/                    # Ядра на разных языках
    typescript/
      .directory.md
      src/
        kernel.ts             # ~150 строк, reference implementation
      package.json
      tsconfig.json
      tests/
        kernel.test.ts        # 19 тестов на соответствие спецификации
    
    java/
      src/main/java/
        Kernel.java           # 50 строк
        Module.java           # Интерфейс
      build.gradle
      tests/
        KernelTest.java
    
    rust/
      src/
        kernel.rs             # 50 строк
      Cargo.toml
      tests/
        kernel_test.rs
    
    lua/
      src/
        kernel.lua            # 50 строк
      tests/
        kernel_test.lua
  
  modules/                    # Переиспользуемые модули
    editor/
      editor.ts               # CodeMirror 6 обёртка
      preview.ts              # Рендер Markdown
      index.html              # Контейнер для редактора
      styles.css
    
    storage/
      storage-interface.ts    # Абстрактный интерфейс
      storage-indexeddb.ts    # IndexedDB (PWA)
      storage-java.ts         # Заглушка для Java (реальная в Java-модуле)
      storage-rust.ts         # Заглушка для Rust
    
    git/
      git.ts                  # isomorphic-git обёртка
      git-interface.ts        # Абстрактный интерфейс
    
    export/
      pdf.ts                  # Paged.js обёртка
      docx.ts                 # Генерация DOCX
      epub.ts                 # Генерация EPUB
  
  platforms/                  # Сборки под платформы
    pwa/
      manifest.json           # PWA манифест
      sw.js                   # Service Worker
      index.html              # Точка входа
      vite.config.ts
    
    javafx/
      src/main/java/
        Main.java             # JavaFX + WebView
        WebViewBridge.java    # Мост Java ↔ JS
      build.gradle
    
    tauri/
      src-tauri/
        main.rs
        Cargo.toml
        tauri.conf.json
  
  tests/
    .directory.md
    conformance/              # Тесты спецификации (общие для всех ядер)
      .directory.md
      test-suite.json         # 13 сценариев (агностик относительно языка)
      runner.ts               # Запуск тестов на TypeScript-ядре
  
  docs/
    .directory.md
    architecture.md
    contributing.md
  
  .github/
    workflows/
      ci.yml                 # Тесты TypeScript-ядра + сборка PWA
```

> **Примечание:** Java и Rust-ядра живут в отдельных репозиториях. Каждое имеет свой CI/CD, issue-трекер и версионирование. В этом репозитории — спецификация, TypeScript-ядро (reference implementation), модули и PWA. Остальные ядра имплементируют контракт независимо.

---

## 4. План разработки

### Фаза 0: Спецификация + Reference Implementation (2 недели)

**День 1–2: KERNEL_SPEC.md — полный контракт**
- [x] Async/await, жизненный цикл, обработка ошибок
- [x] Спецификация событий с success/error
- [x] Review и утверждение

**День 3–5: TypeScript-ядро (reference implementation)**
- [x] `kernels/typescript/kernel.ts` — ~150 строк
- [x] init → start → stop → destroy
- [x] Async хендлеры, последовательное выполнение
- [x] Обработка ошибок модулей (не валит ядро)
- [x] Подписка / отписка с дедупликацией

**День 6–8: Конформные тесты**
- [x] `tests/conformance/test-suite.json` — сценарии (действие → ожидаемые события)
- [x] `tests/conformance/runner.ts` — загрузка сценариев, запуск, отчёт
- [x] Тесты: регистрация, эмит, жизненный цикл, ошибки
- [x] Покрытие: позитивные, негативные, краевые

**День 9–10: Документация**
- [x] `docs/architecture.md`
- [x] `docs/contributing.md`
- [x] `README.md` в корне проекта

**Результат:** стабильное ядро с верифицированным контрактом. Можно начинать писать модули.

---

### Фаза 1: PWA — редактор (3 недели)

**Спринт 1 (неделя): Редактор + превью**
- [x] `modules/editor/editor.ts` — CodeMirror 6 (интеграция с ядром)
- [x] `modules/editor/preview.ts` — Markdown → HTML (marked + DOMPurify)
- [ ] `modules/editor/index.html` — контейнер (встроен в платформу)
- [x] `platforms/pwa/index.html` — точка входа
- [x] `platforms/pwa/src/main.ts` — инициализация ядра и модулей
- [x] XSS-тест: DOMPurify санитизирует HTML перед вставкой

**Спринт 2 (неделя): Сохранение + проекты**
- [x] `modules/storage/storage-interface.ts` — абстракция
- [x] `modules/storage/storage-indexeddb.ts` — IndexedDB
- [x] Боковая панель с деревом файлов
- [x] Создание / открытие / удаление проектов

**Спринт 3 (неделя): PWA-обёртка + интеграция**
- [x] `platforms/pwa/manifest.json`
- [x] `platforms/pwa/sw.js` — офлайн-кеширование
- [x] Иконки (SVG)
- [ ] Тест на телефоне
- [ ] Интеграционный тест: редактор → превью

**Результат:** работает в браузере, устанавливается на телефон, сохраняет офлайн.

**Сборка:** `npm run build` в `strochka/` — успешно (680 KB, 31 модуль).

---

### Фаза 2: Git + Экспорт (3–4 недели)

**Спринт 1 (неделя): Git**
- [ ] `modules/git/git-interface.ts` — абстракция
- [ ] `modules/git/git.ts` — isomorphic-git обёртка
- [ ] Кнопка «Сохранить версию»
- [ ] История коммитов

**Спринт 2 (неделя): Экспорт PDF**
- [ ] `modules/export/pdf.ts` — Paged.js
- [ ] Стилевой профиль по умолчанию
- [ ] Кнопка «Экспорт PDF»

**Спринт 3 (неделя): Экспорт DOCX + EPUB**
- [ ] `modules/export/docx.ts`
- [ ] `modules/export/epub.ts`

**Спринт 4 (неделя): Полировка**
- [ ] Undo/redo (CodeMirror history)
- [ ] Обработка ошибок экспорта
- [ ] UI: тосты, модалки, темы

**Результат:** полный цикл: пишу → сохраняю версию → экспортирую.

---

### Фаза 3: Java-ядро + десктоп (после стабилизации PWA)

**Не начинать, пока PWA не подтвердило концепцию.** Ключевой риск: Java ↔ JS bridge. Начать с proof-of-concept моста до полноценной платформы.

- [ ] `kernels/java/Kernel.java` (~150 строк)
- [ ] Конформные тесты на Java (раннер читает test-suite.json)
- [ ] `platforms/javafx/Main.java` — WebView
- [ ] `platforms/javafx/WebViewBridge.java` — прототип моста (первым делом)
- [ ] Java NIO вместо IndexedDB
- [ ] JGit вместо isomorphic-git

**Результат:** десктопное приложение. Тот же редактор, тот же UX.

---

### Фаза 4: Мобилки (Capacitor)

- [ ] Capacitor-обёртка поверх PWA
- [ ] Нативный FS через Capacitor API
- [ ] Push-уведомления
- [ ] Адаптивный UI, жесты

---

### Фаза 5: Rust-ядро

Когда нужна максимальная производительность или Tauri.

- [ ] `kernels/rust/kernel.rs` (~150 строк)
- [ ] Tauri-сборка

---

## 5. Роадмап

### Горизонт 0: База (Месяцы 1–2)
- [ ] KERNEL_SPEC.md (полный контракт)
- [ ] TypeScript-ядро (reference implementation)
- [ ] Конформные тесты (test-suite.json + runner.ts)
- [ ] PWA: редактор + сохранение + офлайн

### Горизонт 1: Продукт (Месяцы 3–4)
- [ ] Git (isomorphic-git)
- [ ] Экспорт PDF / DOCX / EPUB
- [ ] Undo/redo, темы, полировка

### Горизонт 2: Десктоп + Мобилки (Месяцы 5–8)
- [ ] Java-ядро + JavaFX (после стабилизации PWA)
- [ ] Java ↔ JS bridge (отдельный прототип)
- [ ] Java NIO, JGit
- [ ] Capacitor-сборка для iOS/Android

### Горизонт 3: Расширения (Месяцы 9–12)
- [ ] Rust-ядро для Tauri
- [ ] HTML/CSS-редактор
- [ ] Роли и команды (TEAM.yaml)
- [ ] Пользовательские плагины
- [ ] Стилевые профили
- [ ] AI-ассистенты (локально)

### Горизонт 4: Мечты (Год+)
- [ ] Real-time коллаборация
- [ ] Strochka Cloud
- [ ] Экспорт в Ink / Twine
- [ ] Маркетплейс шаблонов
- [ ] Enterprise (on-premise)

---

## 6. Стек (окончательный)

| Платформа | Язык ядра | UI | Git | Файлы |
|:---|:---|:---|:---|:---|
| **PWA** (все платформы) | TypeScript | HTML/CSS/JS (WebView) | isomorphic-git | IndexedDB |
| **Десктоп** (Windows/Mac/Linux) | Java | JavaFX WebView | JGit | Java NIO |
| **Мобилки** (iOS/Android) | TypeScript | Capacitor WebView | isomorphic-git | Capacitor FS |
| **Лёгкий десктоп** (будущее) | Rust | Tauri WebView | libgit2 | std::fs |

**Общее:** HTML/CSS/JS для редактора. Спецификация ядра. Модули переиспользуются.

---

## 7. Что НЕ делаем в первой версии

- **Java-ядро / Rust-ядро / Lua-ядро** — только после стабилизации PWA и конформных тестов
- **Rich Text / HTML/CSS редактор** — в первой версии только Markdown + превью
- **Canvas, графы, таймлайны** — не целевая аудитория (писатели, не дизайнеры)
- **Роли, команды, коллаборация** — это enterprise, не MVP
- **Cloud, синхронизация** — сначала локальный офлайн-продукт
- **Маркетплейс, плагины** — после того, как API устаканится

---
