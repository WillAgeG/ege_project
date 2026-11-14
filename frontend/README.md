# Frontend — Клиентский стек «Вектор ЕГЭ»

## Технологический стек

- **Рендеринг и архитектура:** Zero-bundler SPA на чистом **HTML5 / CSS3 / ES6+ (IIFE с пространством имён `EGE`)** без Webpack/Vite — мгновенная загрузка и прямой запуск в браузере, `node` и `jsc`.
- **Адаптивность и анимации:** CSS Custom Properties (`--bg`, `--accent`, `--notif`, `--pro`), `@container` queries, CSS Transitions/Keyframes (36 анимированных иконок, авто-моушен на лендинге).
- **Хранение состояния на клиенте:** Оптимистичный кэш в `localStorage` + синхронизация документов с FastAPI REST API (`/api/docs/*`).

## Структура `frontend/`

| Путь | Ответственность |
| :--- | :--- |
| [`index.html`](index.html) | Оболочка SPA, inline-токены (без FOUC), подключение стилей из `ux-ui/styles/` и `frontend/styles/`, строгий порядок подключения скриптов перед `app.js`. |
| [`app.js`](app.js) | Корневой оркестратор приложения: роутинг `VIEWS`, состояние `ui`/`store`, делегаторы действий `ACTIONS`/`FORMS`, тренажёр ЕГЭ и статистика. **Должен сохраняться с окончаниями строк CRLF и грузиться последним.** |
| [`bank-core.js`](bank-core.js) | Сборка банка заданий `EGE.loadBank()`, детерминированные хеш-ID вопросов и наложение табличных патчей. |
| [`core/utils.js`](core/utils.js) | Чистые утилиты `EGE.utils` (DOM, экранирование HTML, `deepMerge`, даты, интервалы повторения). |
| [`styles/study.css`](styles/study.css), [`styles/marketplace.css`](styles/marketplace.css) | Стили учебного тренажёра, графиков, маркетплейса репетиторов, авто-моушена `/landing` и календаря `10:00–20:00`. |
| [`views/landing.js`](views/landing.js) | Витрина `/landing`: авто-моушен торга без слова WhatsApp на карточке, бегущая лента, калькулятор экономии и бета-тренажёр. |
| [`views/marketplace.js`](views/marketplace.js) | Экран подбора репетиторов (`viewMarket`), модалка ставки с ползунком `10:00–20:00`, вкладка «Учёба» (`viewStudy`) и 3 горизонтальных тарифа (`0 / 5 000 / 10 000 ₽`). |
| [`data/`](data) | [`tutors.js`](data/tutors.js) (анкеты из Доски Ykt, Telegram, WhatsApp, MAX; расчёт комиссии), [`plan.js`](data/plan.js), [`essay.js`](data/essay.js). |
| [`subjects/`](subjects) | 40 файлов банка заданий и конспектов (Биология, Русский, Химия) + [`table.js`](subjects/table.js). |

## HTTP-роутинг статики

Файлы из `frontend/` отдаются бэкендом по коротким корневым URL (`/app.js`, `/styles/marketplace.css`, `/views/landing.js`, `/data/tutors.js`, `/subjects/biology.js`), а дизайн-система — по префиксу `/ux-ui/...` (строгий allowlist в [`backend/main.py`](../backend/main.py)).
