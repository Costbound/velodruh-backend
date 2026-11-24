# VeloDruh ETL Pipeline (`src/etl`)

Модуль збору, нормалізації, дедуплікації та ідемпотентного збереження велосипедних пропозицій у **PostgreSQL** (`Brand`, `Shop`, `Bike`, `BikeVariant`, `Offer`).

Підтримує:
- **XML/YML-фіди** інтернет-магазинів (локальні файли та HTTP/HTTPS URL) — **0 кредитів**.
- **ReefAPI маркетплейси** (асинхронні парсери): `olx` (`olx.ua`), `prom-ua`, `rozetka`, `hotline-ua`.
- **Локальні снапшоти (кеш)**: кожна успішна відповідь ReefAPI автоматично зберігається у `data/snapshots/*.json`, щоб повторні прогони та відлагодження коштували **0 кредитів**.
- **Захист від випадкової витрати кредитів**: CLI запускається в режимі **`DRY-RUN` за замовчуванням**; реальні HTTP-запити до ReefAPI виконуються лише з прапорцем `--execute` і жорстко обмежені `--max-credits`.

---

## Структура модуля

```text
src/etl/
├── cli.ts                  # CLI-точка входу (one-time execution / dry-run / replay)
├── pipeline.ts             # Оркестратор ETL (extract -> normalize -> dedup -> persist)
├── types.ts                # Спільні типи RawListing, NormalizedListing, CanonicalBikeRecord
├── index.ts                # Публічні реекспорти
├── sources/
│   ├── xml-feed.parser.ts  # Zero-dependency парсер XML/YML-фідів
│   ├── reefapi.client.ts   # Клієнт ReefAPI (dry-run, maxCredits, disk cache, retry)
│   ├── olx.parser.ts       # Парсер OLX.ua (ReefAPI /olx/v1/search, /offer)
│   ├── prom.parser.ts      # Парсер Prom.ua (ReefAPI /prom-ua/v1/search, /product)
│   ├── rozetka.parser.ts   # Парсер Rozetka (ReefAPI /rozetka/v1/search)
│   └── hotline.parser.ts   # Парсер Hotline.ua (ReefAPI /hotline-ua/v1/category, /search)
├── normalizers/
│   ├── text.utils.ts       # Транслітерація, slugify, ціни/валюти, очищення URL, UTM
│   ├── brand.normalizer.ts # Уніфікація брендів (укр/рос/лат + пошук у назві)
│   ├── category.normalizer.ts # Категорії (GRAVEL, ROAD, MTB_HARDTAIL, CITY_COMMUTER, TOURING, HYBRID)
│   ├── size.normalizer.ts  # Розміри рами (XS..XL, см, мм, дюйми, зріст райдера)
│   ├── specs.normalizer.ts # Назва моделі, рік, гальма, матеріал, колеса, вага, фільтр аксесуарів
│   └── index.ts            # `normalizeListing` / `normalizeListings` / `buildDedupKey`
├── dedup/
│   └── deduplicator.ts     # Склеювання дублікатів за ключем `Бренд + Модель + Рік`
└── loader/
    └── postgres.loader.ts  # Ідемпотентне збереження через Prisma ORM v8 (`db.orm.public.*`)
```

---

## Попереднє налаштування

У директорії `velodruh-backend/`:

1. Переконайтеся, що використовуєте **Node.js `>= 24.14.0`** (`.nvmrc` у корені проєкту).
2. Скопіюйте `.env.example` у `.env` та заповніть змінні:

```bash
cp .env.example .env
```

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/velodruh"

# Джерело каталогу для REST API: "memory" (вбудований список) або "postgres" (з БД)
CATALOG_SOURCE="memory"

# Потрібно ЛИШЕ для live-запуску ReefAPI з прапорцем `--execute`
REEFAPI_BASE_URL="https://api.reefapi.com"
REEFAPI_API_KEY="your_reefapi_key_here"
```

> Ніколи не комітьте `.env` і реальний `REEFAPI_API_KEY` у git. Директорія `data/output/` ігнорується в `.gitignore`, а `data/snapshots/` можна комітити, щоб команда могла перезаливати дані без повторної витрати кредитів ReefAPI (API-ключ у снапшоти не записується).

3. Підніміть локальний PostgreSQL (якщо плануєте записувати в БД):

```bash
docker compose up -d postgres
```

Або вкажіть `DATABASE_URL` на свій екземпляр PostgreSQL 15+ (наприклад, майбутній RDS із `velodruh-infra`).

---

## Як запускати

Усі команди виконуються з директорії `velodruh-backend/`.

### 1. Ініціалізувати таблиці в PostgreSQL (0 кредитів)

```bash
npm run db:init
```

*(Застосовує ідемпотентний DDL із [`src/prisma/init.sql`](../prisma/init.sql); повторні запуски безпечні.)*

### 2. Переглянути план і вартість у кредитах — DRY-RUN (0 кредитів)

```bash
npm run etl:plan
```

Виведе список запланованих викликів ReefAPI та точну кількість кредитів без виконання HTTP-запитів. Перевірити інші пресети:

```bash
npm run etl:run -- --preset minimal
npm run etl:run -- --preset full
```

### 3. Протестувати XML/YML-фід офлайн (0 кредитів)

```bash
npm run etl:demo
```

Запустити власний локальний або віддалений XML/YML-фід і зберегти у PostgreSQL:

```bash
# Локальний файл:
npm run etl:run -- --xml-file path/to/feed.yml --init-schema --save-db

# Віддалений URL:
npm run etl:run -- --xml-url "https://shop.example.ua/feed.xml" --save-db

# Експорт нормалізованого результату в JSON без БД:
npm run etl:run -- --xml-file data/fixtures/sample-feed.yml --out data/output/demo.json
```

### 4. Засідити базовий каталог (`CATALOG_BIKES`) у Postgres (0 кредитів)

```bash
npm run etl:seed
```

### 5. Одноразовий LIVE-запуск через ReefAPI (витрачає кредити)

> Рекомендується спершу перевірити план через `npm run etl:plan` і задати `--max-credits` із невеликим запасом. Усі успішні відповіді автоматично кешуються в `data/snapshots/`.

```bash
# Мінімальний прогін: OLX + Prom.ua (6 кредитів, ~176 оголошень)
npm run etl:run -- --preset minimal --max-credits 10 --execute --init-schema --save-db

# MVP-прогін: OLX + Prom.ua + Rozetka (18 кредитів, ~510 оголошень)
npm run etl:run -- --preset mvp --max-credits 20 --execute --init-schema --save-db

# Вибіркові джерела та кастомний пошук (наприклад, лише БУ на OLX):
npm run etl:run -- \
  --sources olx \
  --olx-condition used \
  --query "велосипед гравійний" \
  --query "pride rocx" \
  --max-credits 5 \
  --execute \
  --out data/output/olx-bikes.json \
  --save-db
```

### 6. Повторний запуск із кешованих снапшотів (0 кредитів!)

Після одного live-запуску можна скільки завгодно разів перезапускати нормалізацію, дедуплікацію та запис у БД **без жодного виклику ReefAPI**:

```bash
npm run etl:run -- --from-snapshot data/snapshots --save-db

# Поєднати збережені снапшоти + XML-фід + сидовий каталог:
npm run etl:run -- \
  --from-snapshot data/snapshots \
  --xml-file data/fixtures/sample-feed.yml \
  --seed \
  --out data/output/catalog.json \
  --save-db
```

### 7. Перемкнути REST API на читання з PostgreSQL

У `.env` змініть:

```env
CATALOG_SOURCE="postgres"
```

Після перезапуску `npm run dev` (або `npm start`) ендпоінти `GET /api/v1/bikes`, `GET /api/v1/bikes/:slug` та `POST /api/v1/wizard/recommendations` читатимуть дані безпосередньо з PostgreSQL.

---

## Пресети та вартість кредитів ReefAPI

| Пресет | Джерела (по 1 сторінці на запит) | Вартість | Орієнтовно рядків |
|---|---|---:|---:|
| `minimal` | OLX (`2×1`) + Prom.ua (`2×2`) | **6 кредитів** | ~176 |
| `mvp` *(default)* | OLX (`3×1`) + Prom.ua (`3×2`) + Rozetka (`3×3`) | **18 кредитів** | ~510 |
| `full` | OLX (`5×1`) + Prom.ua (`5×2`) + Rozetka (`4×3`) + Hotline (`2×3`) | **33 кредити** | ~900+ |

Базова вартість окремих ендпоінтів ReefAPI:
- `POST /olx/v1/search` — **1 кредит** (до 50 оголошень)
- `POST /olx/v1/offer` — **1 кредит** (деталі одного оголошення)
- `POST /prom-ua/v1/search` — **2 кредити** (до 60 оферів)
- `POST /prom-ua/v1/product` — **1 кредит** (деталі одного товару)
- `POST /rozetka/v1/search` — **3 кредити** (до 60 товарів)
- `POST /hotline-ua/v1/category` — **2 кредити** (до 48 товарів)
- `POST /hotline-ua/v1/search` — **3 кредити** (до 48 товарів)

*Помилкові / заблоковані запити (`ok: false`) в ReefAPI безкоштовні (0 кредитів).*

---

## Параметри CLI (`npm run etl:run -- --help`)

| Прапорець | Опис | За замовчуванням |
|---|---|---|
| `--preset <name>` | Набір запитів: `minimal`, `mvp`, `full` | `mvp` |
| `--sources <list>` | Джерела через кому: `olx,prom,rozetka,hotline` | усі з пресету |
| `--query <text>` | Власний пошуковий запит (можна повторювати) | із пресету |
| `--pages <n>` | Кількість сторінок на кожен запит | `1` |
| `--max-credits <n>` | Жорсткий ліміт кредитів за один запуск | `25` |
| `--olx-condition <val>` | Фільтр стану OLX: `used` \| `new` | не задано |
| `--prom-condition <val>` | Фільтр стану Prom: `new` \| `used` \| `refurbished` \| `markdown` | не задано |
| `--hotline-category <slug>` | Слаг категорії Hotline.ua (2 кр/стор.) | не задано |
| `--enrich-details <n>` | Макс. кількість додаткових запитів деталей (`olx/offer`, `prom-ua/product`) | `0` |
| `--min-price <uah>` / `--max-price <uah>` | Діапазон допустимих цін велосипеда (грн) | `2000` / `600000` |
| `--xml-file <path>` | Локальний XML/YML-фід (можна повторювати) | — |
| `--xml-url <url>` | Віддалений XML/YML-фід (можна повторювати) | — |
| `--snapshot-dir <dir>` | Директорія кешу сирих відповідей ReefAPI | `data/snapshots` |
| `--from-snapshot <path>` | Завантажити збережений снапшот або директорію (0 кредитів) | — |
| `--refresh-cache` | Ігнорувати локальний кеш (лише разом із `--execute`) | `false` |
| `--seed` | Додати кураторський набір `CATALOG_BIKES` (0 кредитів) | `false` |
| `--out <path>` | Експортувати нормалізований каталог у JSON | — |
| `--init-schema` | Створити таблиці PostgreSQL, якщо їх ще немає | `false` |
| `--save-db` | Зберегти результат у PostgreSQL (ідемпотентно) | `false` |
| `--execute` | Дозволити реальні HTTP-запити до ReefAPI (без нього — dry-run) | `false` |

---

## Тести

```bash
npm test
```

Усі ETL-тести повністю офлайн (мок `fetch`, in-memory store, локальний фікстурний YML-фід) і не витрачають кредити ReefAPI:
- `test/etl.normalizers.test.ts` — бренди, категорії, розміри рам, рік, ціни, фільтр аксесуарів
- `test/etl.xml-feed.test.ts` — парсер XML/YML, CDATA, валюти, `available="false"`, ліміт розміру
- `test/etl.dedup.test.ts` — дедуплікація за ключем `Бренд + Модель + Рік`
- `test/etl.reefapi-parsers.test.ts` — dry-run, `maxCredits`, повернення кредитів при помилці, кеш снапшотів, парсери OLX/Prom/Rozetka/Hotline
- `test/etl.loader-pipeline.test.ts` — ідемпотентний запис та повний end-to-end прогін пайплайну
