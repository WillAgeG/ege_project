# Архитектура проекта «Вектор ЕГЭ»

> **Коротко:** Zero-bundler веб-приложение (чистый HTML/CSS/ES6+ без сборки Webpack/Vite) + Python FastAPI бэкенд с SQLite и деплоем в Docker/Railway. Вся статика грузится напрямую браузером, а тесты запускаются и в `pytest`, и в `node` / `jsc` без шага компиляции.

---

## 1. Карта директорий и файлов: что где лежит и почему

| Путь | Что внутри | Почему лежит именно здесь |
| :--- | :--- | :--- |
| **`index.html`** *(256 строк)* | CSS-токены светлой/тёмной тем, каркас оболочки (`.shell`, `.side`, `.topbar`, `.tabbar`), подключение `styles/*.css` и последовательный список `<script src>` | Точка входа SPA. Вся стилистика (1 880+ строк CSS) вынесена в `styles/`, но **токены `--accent: #0070ff` и `--accent: #1d7bff` оставлены в inline `<style>`**, чтобы тема применялась без мигания до загрузки CSS и проходила smoke-проверку бэкенда (`test_health_and_html_shell`). |
| **`app.js`** *(4 245 строк)* | Инициализация приложения, состояние (`ui`, `store`), роутер (`VIEWS`), тренажёр ЕГЭ, эссе, показатели, справочник, `ACTIONS` и `FORMS` | Корневой оркестратор. Должен загружаться **строго последним скриптом** после `src/*`, `data/*`, `subjects/*` и `bank-core.js` — это контролирует `tests/check_app.js` и точка инжекции `window.EGE_HOST` в `server/main.py`. |
| **`bank-core.js`** *(94 строки)* | Детерминированная сборка банка заданий, хеш-идентификаторы, дедупликация и наложение патчей из таблицы | Вынесено в отдельный модуль `EGE.loadBank()`, чтобы одинаково работать и на основном сайте, и в сервисном инструменте `tools/bank.html`. |

---

## 2. Стили — папка `styles/` *(1 882 строки в 4 файлах)*

CSS разделён по зонам ответственности вместо одного монолитного `<style>` в `index.html`:

1. **[`styles/base.css`](styles/base.css)** *(459 строк)* — базовый слой дизайн-системы hh.ru:
   - сброс, прокрутка без переполнения (`overflow-x: clip`), шрифт Inter / IBM Plex Mono;
   - макет оболочки (`.shell`, `.side`, `.topbar`, `.tabbar`), карточки `.card`, типографика `.h1`–`.h3`;
   - все базовые контролы: `.btn`, `.soft` (с углублением тинта без сливания с белым), `.is-confirmed` (`#0070FF` → зелёный `380 ms`), `.icon-btn`, `.fav-btn`, `.chip`, `.switch`, формы, модальные окна, боковые уведомления `.toast.is-side` и экран авторизации.
2. **[`styles/study.css`](styles/study.css)** *(276 строк)* — учебный контур тренажёра:
   - обратный отсчёт до экзамена, карточки предметов и тем;
   - конспекты `.theory` и адаптивные таблицы, сценарии тестирования (`.opt`, `.pair`, `.feedback`);
   - графики активности (`.bars`, `.dot-row`), панель пробников и AI-тьютор/справочник.
3. **[`styles/marketplace.css`](styles/marketplace.css)** *(761 строка)* — витрина `/landing`, подбор репетиторов и «Учёба»:
   - hero-секция и авто-моушен (`.motion-stage`, `.motion-cursor`), двухрядная бегущая лента `.marquee-band`, сравнение цен `.savings-grid`;
   - карточки репетиторов (`.tutor-card`), прочерк старой цены `.hh-price-old`, фиолетовые бейджи высокой квалификации `.diff-tag.pro`, оранжевые уведомления;
   - **рельса дней `.cal-days` (обязательный `padding-top: 6px`, чтобы при `:hover` не резалась синяя рамка)**, ползунок-палка `.hh-time-range` (`10:00–20:00`), степпер `.hh-price-stepper` (`±100 ₽`);
   - 3 горизонтальных тарифа (`0 / 5 000 / 10 000 ₽`, особый стиль `.super` у 10 000 ₽), страница `/fees`, график недели и чаты во вкладке «Учёба»;
   - адаптив для узких экранов (`< 680 px`, `< 480 px`, `< 360 px`) и `@container`.
4. **[`styles/brandbook.css`](styles/brandbook.css)** *(386 строк)* — UI-кит `/brandbook`:
   - 3 контрастных поверхности рядом (Белый `#FFFFFF/#F4F5F7`, Чёрный OLED `#000000/#16181D`, Синий `#0070FF`);
   - матрица кнопок, 3 варианта ползунков, сетка 36 интерактивных иконок `.bb-icon-grid` с **17 CSS-анимациями `@keyframes`**;
   - чертёж визуальных границ и безопасных зон (`.bb-blueprint-grid`), интерактивный макет мобильного экрана (`.bb-phone-frame`) и живой адаптивный стенд `#bb-responsive` (`@container` 320–1100 px).

---

## 3. Клиентские модули — папка `src/` *(2 742 строки в 6 файлах)*

Все файлы в `src/` выполнены в формате IIFE без импортов/бандлера: используют `(typeof globalThis !== "undefined" ? globalThis : window).EGE` и подключаются в `index.html` строго в порядке зависимостей **до `app.js`**.

| Файл | Пространство | Содержимое | Почему выделен отдельно |
| :--- | :--- | :--- | :--- |
| **[`src/core/utils.js`](src/core/utils.js)** *(214)* | `EGE.utils` | `$`, `esc`, `rich`, `clone`, `deepMerge`, работа с ISO-датами, `plural`, `minutesText`, `norm`, `parseNum`, `byDue`, `initials`, `scrollToEl` | Нулевые зависимости от UI и состояния; легко тестируются и переиспользуются во всех модулях. |
| **[`src/ui/icons.js`](src/ui/icons.js)** *(134)* | `EGE.ui` | 36 SVG-контуров `ICONS` (единый `stroke-width: 1.8`), `icon()`, логотип `BRAND_MARK_HTML`, `GOOGLE_SVG`, каталог для брендбука `getIconCatalog(dark)`, триггер анимации плитки `triggerIconTileAnim(tile)` | Хранит все графические примитивы в одном месте, не раздувая бизнес-логику `app.js`. |
| **[`src/ui/hh-components.js`](src/ui/hh-components.js)** *(103)* | `EGE.hh` | `isValidHHMM`, `feeSplitHTML(price)`, `bidBtnLabelHTML(sent, price)`, `priceHeadlineHTML(market, offer)`, `priceDiffTagsHTML(opts)`, `sliderTicksHTML(hour, style)`, `BB_DAYS`, `bbDayObj(id)` | Единая реализация «hh.ru»-паттернов (зачёркнутая цена рынка, синий→зелёный отклик, фиолетовые профи-теги, засечки ползунка) сразу для `/landing`, маркета, модалки и `/brandbook`. |
| **[`src/views/brandbook.js`](src/views/brandbook.js)** *(810)* | `EGE.views.brandbook` | `brandbookPaneHTML`, `viewBrandbook`, `viewFees`, `applyBrandbookViewport` | Изолирует витрину UI-кита, правила границ, калькулятор 5% сбора (`/fees`) и живой стенд ширины без захламления рабочего кабинета. |
| **[`src/views/marketplace.js`](src/views/marketplace.js)** *(692)* | `EGE.views.marketplace` | `configure(ctx)`, `plansSectionHTML`, `tutorCardHTML`, `bookingsStripHTML`, `marketSectionHTML`, `bookingModalHTML`, `updateBookingModalLive`, `filterModalHTML`, `activeFilterCount`, `viewMarket`, `viewStudy` | Весь маркетплейс репетиторов и недельное расписание собраны вместе; общается с `app.js` через явный контекст `configure({ ui, mkt, TDATA, viewPlan })`. |
| **[`src/views/landing.js`](src/views/landing.js)** *(789)* | `EGE.views.landing` | `configure(ctx)`, `MOTION_PRESETS`, `MOTION_ORDER`, сценарий авто-моушена (`heroMotionMeta`, `patchHeroMotionDOM`, `syncHeroMotion`, `stopMotionTimers`, `pulseMotionReset`), бегущая лента, калькулятор экономии и бета-тренажёр (`landingPageHTML`) | Отделяет публичную/внутреннюю витрину и её таймеры авто-моушена от ядра тренажёра. |

> В `app.js` оставлены только короткие функции-делегаторы (`function viewMarket() { return EGE.views.marketplace.viewMarket(); }` и т. п.) с `function`-поднятием (hoisting), чтобы таблица маршрутов `VIEWS` и обработчики `ACTIONS`/`FORMS` работали без изменений.

---

## 4. Данные, контент и сервер

- **`data/`**:
  - [`data/tutors.js`](data/tutors.js) *(774 строки)* — каталог репетиторов (`EGE.tutors`: анкеты с Доски Ykt, Telegram, WhatsApp, MAX и др.), свободные окна `10:00–20:00`, расчёт комиссии `5%` (`commissionSplit`), фильтры, сигналы цены и 3 тарифа (`0 / 5 000 / 10 000 ₽`).
  - [`data/plan.js`](data/plan.js) *(72 строки)* — шаблон расписания до экзаменов.
  - [`data/essay.js`](data/essay.js) *(125 строк)* — критерии проверки сочинения.
- **`subjects/`** *(40 файлов)* — задания и конспекты по Биологии, Русскому языку и Химии + патчи правок `subjects/table.js`. Подключаются в `index.html` до `bank-core.js`.
- **`server/`** *(FastAPI + SQLite)*:
  - [`server/main.py`](server/main.py) *(468 строк)* — SPA-маршруты (`/`, `/landing`, `/brandbook`, `/fees`, `/privacy` — с инжекцией `window.EGE_HOST`), API (`/api/auth/*`, `/api/docs/*`, `/api/ai/*`, `/api/health`) и строгий allowlist статики `static_assets`.
  - [`server/db.py`](server/db.py) *(586 строк)* — SQLite WAL-хранилище, пользователи, сессии, приглашения, миграция legacy-БД.
  - [`server/ai.py`](server/ai.py) *(281 строка)* — прокси стриминга для Gemini / OpenAI / Anthropic / OpenRouter.
  - [`server/config.py`](server/config.py) *(127 строк)* — загрузка настроек из переменных окружения / `.env`.
- **`tests/` & `tools/`**:
  - [`tests/check_app.js`](tests/check_app.js) *(1 042 строки)* — проверяет сборку банка, порядок загрузки скриптов из `index.html`, навигацию и DOM-рендер в Node/JSC.
  - [`tests/test_server.py`](tests/test_server.py) *(654 строки)* — интеграционные тесты FastAPI (`pytest`), включая проверку выдачи `styles/*.css`, `src/**/*.js`, и защиту `404` от чтения `/.env`, `server/*`, `tools/*` и path traversal (`../`).
  - [`tools/bank.html`](tools/bank.html), [`tools/bank-tools.js`](tools/bank-tools.js), [`bank/bank.csv`](bank/bank.csv) — локальный инструмент редактирования и выгрузки банка (в продакшен-образе скрыт).
- **Деплой и CI**: [`Dockerfile`](Dockerfile) *(копирует `styles/`, `src/`, `data/`, `subjects/`, `server/`, `index.html`, `app.js`, `bank-core.js`)*, [`requirements.txt`](requirements.txt), [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

---

## 5. Важные инварианты (что нельзя сломать при правках)

1. **Порядок `<script>` в `index.html`:** все модули `src/*` (и `data/*`, `subjects/*`, `bank-core.js`) обязаны стоять **до** `<script src="app.js"></script>`. `tests/check_app.js` проверяет `scripts[scripts.length - 1] === "app.js"`, а `server/main.py` ищет `<script src="app.js"></script>` для вставки `window.EGE_HOST`.
2. **CRLF в `app.js`:** `tests/check_app.js` проверяет окончания строк CRLF в `app.js`. После редактирования в Linux/macOS сохраняйте CRLF.
3. **Allowlist и Docker при добавлении новых папок:** любая новая директория фронтенда должна одновременно добавиться в `server/main.py:static_assets`, в `Dockerfile` (`COPY ...`) и в `tests/test_server.py:test_static_asset_allowlist`.
4. **Цвета брендбука и защита от регрессий:**
   - В inline `<style>` внутри `index.html` обязательно остаются `--accent: #0070ff` (Light) и `--accent: #1d7bff` (Dark) без старого зелёного `#13794b`.
   - Счётчики уведомлений строго оранжевые (`#F97316` / `#FB923C`), повышение ставки выше рынка — фиолетовое (`#7C3AED` / `#A78BFA`), статус «Подтверждено» — зелёный только у CTA после клика (`#16A34A` / `#22C55E`).
   - Комиссия системы (`5%`) скрыта от карточки выбора и раскрывается только при оплате на странице `/fees`.
5. **Безопасный JS без вложенных backticks:** внутри template literals нельзя использовать символ `` ` `` (иначе синтаксис ломается при вставке). Используйте `<code>...</code>` в HTML.

---

## 6. Куда добавлять новый функционал (шпаргалка)

- **Новый стиль или компонент дизайна →** в профильный CSS из `styles/` (общий UI в `base.css`, маркет/лендинг в `marketplace.css`, брендбук в `brandbook.css`).
- **Новая экранная секция маркетплейса / брендбука / лендинга →** в соответствующий файл `src/views/*.js`, а при новой кнопке `data-a="..."` — добавить обработчик в `ACTIONS` в `app.js`.
- **Новая SVG-иконка →** контур `viewBox 0 0 24 24` (`stroke-width 1.8`) в `ICONS` и элемент каталога в `getIconCatalog` внутри `src/ui/icons.js`, а CSS-анимацию — в `styles/brandbook.css`.
- **Проверка после любых изменений →**
  ```bash
  .venv/bin/pytest -v tests/test_server.py
  node tests/check_app.js   # или /System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc tests/check_app.js на macOS
  ```
