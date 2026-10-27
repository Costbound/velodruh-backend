# VeloDruh Backend (`velodruh-backend`)

Backend service for **VeloDruh** — a smart bicycle selection assistant (Smart Matching Wizard) and cross-market price aggregator for the Ukrainian cycling market.

Built with **Node.js 24+**, **Express 5**, **TypeScript (ESM)**, **Prisma ORM v8**, **Zod**, and **Swagger / OpenAPI 3.1**.

---

## Core Components

1. **Express 5 Application Baseline (`src/app.ts`, `src/server.ts`)**
   - Security headers via `helmet` and configurable `cors` origin allowlist.
   - Request tracing via `x-request-id` header propagation (`requestIdMiddleware`).
   - Centralized error handling (`errorHandler`, `notFoundHandler`) with typed `AppError` responses (`statusCode`, `code`, `details`).
   - Graceful shutdown on `SIGINT` / `SIGTERM`.
2. **Validation & Schemas (`src/schemas/`, `src/middlewares/validate.ts`)**
   - Zod v4 schemas for request `body`, `query`, and `params` validation (`validateRequest`).
   - Enforces domain invariants (e.g., surface proportions `asphalt + gravel + offroad === 100`, `maxUah >= minUah`, rider height `140–215 cm`).
3. **Data Layer — Prisma ORM v8 (`src/prisma/`)**
   - Declarative data contract in `src/prisma/contract.prisma` defining:
     - Enums: `BikeCategory`, `RiderGender`, `BrakeType`, `FrameMaterial`, `RidingPosition`
     - Models: `Brand`, `Bike`, `BikeVariant`, `Shop`, `Offer`, `QuizSubmission`
   - Compiled contract (`contract.json`) and generated TypeScript definitions (`contract.d.ts`) consumed by `src/prisma/db.ts`.
4. **Smart Matching Wizard & Catalog Services (`src/services/`)**
   - `wizard.service.ts`:
     - Determines recommended bike category (`GRAVEL`, `ROAD`, `MTB_HARDTAIL`, `CITY_COMMUTER`, `TOURING`, `HYBRID`) with human-readable reasoning.
     - Calculates frame size (`XS`–`XL` and numeric size in `cm`) from rider height and optional inseam length.
     - Ranks bikes using a multi-factor scoring algorithm (surface affinity, category fit, budget fit, riding position, and required features) and attaches the best in-stock partner shop offer.
   - `bikes.service.ts` & `catalog.data.ts`:
     - Provides catalog filtering by category and UAH price range, as well as deep-dive model specifications, geometry (`stackMm`, `reachMm`), and shop offers (`Velogo`, `Велопланета`, `ВелоОнлайн`).
5. **OpenAPI 3.1 & Swagger UI (`src/routes/docs.route.ts`)**
   - Interactive Swagger UI served at `GET /api-docs`.
   - Raw OpenAPI 3.1.0 JSON specification served at `GET /api-docs.json`.

---

## Directory Structure

```text
velodruh-backend/
├── src/
│   ├── app.ts                      # Express 5 app factory, middleware & route mounting
│   ├── server.ts                   # HTTP server entrypoint & graceful shutdown
│   ├── config/
│   │   └── env.ts                  # Zod-validated environment configuration
│   ├── controllers/
│   │   ├── bikes.controller.ts     # HTTP handlers for bike catalog endpoints
│   │   └── wizard.controller.ts    # HTTP handlers for Wizard meta & evaluation
│   ├── middlewares/
│   │   ├── app-error.ts            # Typed AppError class
│   │   ├── error-handler.ts        # x-request-id, 404, and global error middleware
│   │   └── validate.ts             # Zod request validation middleware
│   ├── prisma/
│   │   ├── contract.prisma         # Prisma v8 data contract (domain schema)
│   │   ├── contract.json           # Generated compiled contract
│   │   ├── contract.d.ts           # Generated TypeScript contract types
│   │   └── db.ts                   # Prisma PostgreSQL runtime client
│   ├── routes/
│   │   ├── api.router.ts           # Root /api/v1 router
│   │   ├── bikes.route.ts          # /api/v1/bikes routes
│   │   ├── docs.route.ts           # /api-docs (Swagger UI) & /api-docs.json
│   │   ├── health.route.ts         # /health liveness route
│   │   └── wizard.route.ts         # /api/v1/wizard routes
│   ├── schemas/
│   │   ├── bike.schema.ts          # Bike catalog DTOs & query/param schemas
│   │   └── wizard.schema.ts        # Wizard request/response DTOs & validation schemas
│   └── services/
│       ├── bikes.service.ts        # Catalog querying & filtering logic
│       ├── catalog.data.ts         # Curated Ukrainian bike market dataset
│       └── wizard.service.ts       # Frame sizing, category selection & scoring engine
├── test/
│   ├── helpers/
│   │   └── test-client.ts          # Pure Node in-memory HTTP dispatcher for Jest
│   ├── bikes.test.ts               # Catalog & deep-dive endpoint tests
│   ├── health.test.ts              # Healthcheck, OpenAPI spec & middleware tests
│   └── wizard.test.ts              # Wizard unit & integration tests
├── .env.example                    # Example environment variables
├── eslint.config.mjs               # ESLint flat config
├── jest.config.cjs                 # Jest ESM + ts-jest configuration
├── package.json                    # Scripts & dependencies (Node >= 24.14.0)
├── prisma.config.ts                # Prisma CLI configuration
├── tsconfig.json                   # TypeScript configuration
└── tsconfig.build.json             # Production build TypeScript configuration
```

---

## Prerequisites & Project Setup

1. **Node.js Version**
   Requires **Node.js `>= 24.14.0`** (configured in root `.nvmrc`):
   ```bash
   nvm use
   ```

2. **Install Dependencies**
   ```bash
   cd velodruh-backend
   npm install
   ```

3. **Environment Variables**
   Copy `.env.example` to `.env` and adjust values as needed:
   ```bash
   cp .env.example .env
   ```

4. **Prisma ORM Contract & Database Setup**
   When modifying `src/prisma/contract.prisma`, regenerate the compiled contract and types:
   ```bash
   npm run contract:emit
   ```
   To initialize tables against a running PostgreSQL 15+ instance:
   ```bash
   npx prisma db init
   npx prisma migration status
   ```

---

## Running the Application & Tests

| Task | Command | Description |
|---|---|---|
| **Development Server** | `npm run dev` | Starts the server in watch mode (`tsx watch src/server.ts`) on `http://localhost:3000` |
| **Production Build** | `npm run build` | Compiles TypeScript to `dist/` using `tsconfig.build.json` |
| **Start Production** | `npm start` | Runs the compiled server (`node dist/server.js`) |
| **Run Tests (Jest)** | `npm test` | Runs all unit and API tests via Jest (without Supertest) |
| **Test Watch Mode** | `npm run test:watch` | Runs Jest in interactive watch mode |
| **Test Coverage** | `npm run test:coverage` | Runs Jest and generates coverage report in `coverage/` |
| **Lint** | `npm run lint` | Checks code with ESLint |
| **Format** | `npm run format` | Formats files with Prettier |

---

## API Endpoints Overview

- `GET /health` — Liveness health check (`{ "status": "ok" }`).
- `GET /api-docs` — Interactive Swagger UI documentation.
- `GET /api-docs.json` — Raw OpenAPI 3.1.0 specification in JSON format.
- `GET /api/v1/wizard/meta` — Metadata, ranges, surfaces, goals, and features for the frontend step-by-step Wizard.
- `POST /api/v1/wizard/evaluate` — Evaluates rider profile, budget, and surface usage; returns recommended bike category, calculated frame size (`XS`–`XL`), and top-ranked bikes with match scores and shop offers.
- `GET /api/v1/bikes` — Lists bikes with optional `category`, `minPriceUah`, and `maxPriceUah` filters.
- `GET /api/v1/bikes/:slug` — Detailed model specs, frame size geometry (`stackMm`, `reachMm`), and partner shop offers.

