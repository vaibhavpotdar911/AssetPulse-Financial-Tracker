# AssetPulse 📈🛡️

[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-14.2+-black.svg)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6+-blue.svg)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-3.4+-38bdf8.svg)](https://tailwindcss.com/)
[![Prisma ORM](https://img.shields.io/badge/Prisma-5.21+-5a67d8.svg)](https://www.prisma.io/)
[![Database](https://img.shields.io/badge/Database-SQLite%20%7C%20MySQL-emerald.svg)](#dual-database-engine)
[![Tests](https://img.shields.io/badge/Tests-Vitest%20Passing-brightgreen.svg)](#testing--quality-verification)

> **AssetPulse** is an open-source, lightweight personal financial asset tracking platform designed for individual investors. It provides institutional-grade Fixed Deposit (FD) tracking, automated compounding calculations, proactive maturity alert notifications, immutable audit-logging of all funds disposition, and dual-database flexibility (zero-config embedded SQLite with instant switch to external MySQL).

---

## Table of Contents
1. [Core Features](#core-features)
2. [Architecture & System Design](#architecture--system-design)
   - [Diagram 1: System Overview & Topology](#diagram-1-system-overview--topology)
   - [Diagram 2: Dual-Database Synchronization Engine](#diagram-2-dual-database-synchronization-engine)
   - [Diagram 3: Fixed Deposit Lifecycle & Audit Ledger State Machine](#diagram-3-fixed-deposit-lifecycle--audit-ledger-state-machine)
   - [Diagram 4: Maturity Scanning & Proximity Alert Pipeline](#diagram-4-maturity-scanning--proximity-alert-pipeline)
3. [Quick Start Guide](#quick-start-guide)
4. [Environment Variables Reference](#environment-variables-reference)
5. [Dual-Database Engine (SQLite vs MySQL)](#dual-database-engine)
6. [Docker & Self-Hosting Guide](#docker--self-hosting-guide)
7. [Git Hygiene & Branching Standards](#git-hygiene--branching-standards)
8. [Testing & Quality Verification](#testing--quality-verification)
9. [License](#license)

---

## Core Features

- **Multi-Frequency Compound Interest Engine**:
  Computes exact maturity proceeds, total interest yield, and daily accrued interest across Monthly ($n=12$), Quarterly ($n=4$), Semi-Annual ($n=2$), Annual ($n=1$), and At-Maturity simple conventions with $\pm \$0.01$ precision.
- **Immutable Audit Ledger & Disposition Tracking**:
  No deposit is ever silently removed. When a deposit matures, is reinvested, or suffers premature liquidation, mandatory disposition metadata (reason, destination account, penalty, net proceeds) is permanently recorded in an append-only audit trail.
- **Proactive In-App & Multi-Channel Alerts**:
  Automated detection of deposits maturing within 30, 14, and 7 days, as well as deposits matured today. Includes an in-app notification center (unread pill badge and dropdown) and multi-channel webhook dispatching (Discord, Slack, Telegram, generic JSON).
- **Dual-Database Portability**:
  Zero external database server needed for local development via embedded SQLite (`fintrack.db`). Switch seamlessly to production MySQL simply by configuring `DATABASE_URL` in `.env`.
- **Zero-FOUC Theme System**:
  Tailwind CSS styled with custom brand palette (Emerald `#08ad6a` and Deep Indigo `#201e51`), persistent light/dark/system toggle with no flash of unstyled content.

---

## Architecture & System Design

### Diagram 1: System Overview & Topology
This diagram illustrates the layered boundaries of AssetPulse, spanning client interfaces, Edge Middleware security barriers, Next.js API route handlers, core business calculation engines, and database abstraction.

```mermaid
graph TD
    subgraph ClientLayer ["Client Browser Layer"]
        UI_Shell["App Shell (Navbar, ThemeToggle, Logo)"]
        UI_Notif["Notification Center (Bell Badge & Dropdown)"]
        UI_Dash["Dashboard (Totals, Banners, Active FDs)"]
        UI_Modal["Disposition Modal (Close / Liquidate / Reason)"]
        UI_Audit["Immutable Audit Log Viewer (Filters & Snapshots)"]
    end

    subgraph SecurityLayer ["Edge Middleware Security Layer"]
        MW["Next.js Edge Middleware (src/middleware.ts)"]
        CookieCheck{"Session Cookie Valid?"}
        MW --> CookieCheck
        CookieCheck -- "No (Page)" --> RedirLogin["307 Redirect to /login"]
        CookieCheck -- "No (API)" --> Reject401["401 Unauthorized JSON"]
        CookieCheck -- "Yes" --> RouteNext["Proceed to Route Handler"]
    end

    subgraph ApiLayer ["Server API Routes Layer"]
        API_Auth["/api/auth/* (register, login, logout, me)"]
        API_Deposits["/api/deposits/* (CRUD, close, recalculate)"]
        API_Audit["/api/audit-logs/* (filtered query)"]
        API_Notif["/api/notifications/* (read, scan)"]
        API_Cron["/api/cron/maturity-check (protected webhook runner)"]
    end

    subgraph ServiceLayer ["Core Business Services Layer"]
        SVC_Math["Financial Calculation Engine (src/lib/financial.ts)"]
        SVC_Scan["Maturity Proximity Scanner (src/lib/notifications.ts)"]
        SVC_Webhook["Multi-Channel Webhook Dispatcher"]
        SVC_Audit["Audit Logger (src/lib/audit.ts)"]
        SVC_DB["Prisma Client Singleton (src/lib/db.ts)"]
    end

    subgraph DataLayer ["Dual-Database Storage Layer"]
        DB_SQLite[("Embedded SQLite: fintrack.db\nZero-Config Default")]
        DB_MySQL[("External MySQL Server\nConfigured via DATABASE_URL")]
    end

    ClientLayer --> MW
    RouteNext --> ApiLayer
    API_Auth --> SVC_DB
    API_Deposits --> SVC_Math
    API_Deposits --> SVC_Audit
    API_Deposits --> SVC_DB
    API_Audit --> SVC_DB
    API_Notif --> SVC_Scan
    API_Cron --> SVC_Scan
    SVC_Scan --> SVC_Webhook
    SVC_Scan --> SVC_DB
    SVC_Audit --> SVC_DB
    SVC_DB --> DB_SQLite
    SVC_DB --> DB_MySQL
```

---

### Diagram 2: Dual-Database Synchronization Engine
AssetPulse enables instant switching between local embedded SQLite and production MySQL without altering business code. `scripts/db-prep.js` inspects the environment and dynamically synchronizes the Prisma schema datasource provider.

```mermaid
sequenceDiagram
    autonumber
    actor Developer as Developer / CI
    participant Script as scripts/db-prep.js
    participant Env as .env Configuration
    participant Schema as prisma/schema.prisma
    participant PrismaCLI as Prisma CLI (generate / push)
    participant Engine as Database Engine

    Developer->>Script: Run npm run db:prep
    Script->>Env: Inspect DB_TYPE and DATABASE_URL
    alt DB_TYPE == "mysql" or DATABASE_URL starts with mysql://
        Script->>Schema: Set datasource provider = "mysql"
        Script->>Developer: Log "Configured for MySQL"
    else Default Fallback
        Script->>Schema: Set datasource provider = "sqlite"
        Script->>Developer: Log "Configured for Embedded SQLite"
    end
    Script->>PrismaCLI: Execute prisma generate
    PrismaCLI->>Engine: Generate type-safe PrismaClient
    Developer->>PrismaCLI: Run npm run db:push
    PrismaCLI->>Engine: Synchronize User, FixedDeposit, AuditLog, Notification tables
    Developer->>Script: Run npm run db:seed
    Script->>Engine: Populate demo user and verified sample portfolio
```

---

### Diagram 3: Fixed Deposit Lifecycle & Audit Ledger State Machine
Fixed Deposits follow a strict financial lifecycle. Crucially, when an asset is closed, liquidated, or deleted, mandatory disposition metadata is enforced and immortalized in the append-only `AuditLog` ledger.

```mermaid
stateDiagram-v2
    [*] --> ACTIVE: Deposit Created (POST /api/deposits)
    note right of ACTIVE: Accruing daily interest\nMonitored by proximity scanner

    ACTIVE --> ACTIVE: Tenure Progresses (Interest Accrues)
    ACTIVE --> MATURED: Current Date >= Maturity Date

    ACTIVE --> LIQUIDATED: Premature Exit (Close Modal)
    MATURED --> CLOSED: Orderly Closure / Reinvestment (Close Modal)

    state CloseAction <<choice>>
    LIQUIDATED --> CloseAction
    CLOSED --> CloseAction

    CloseAction --> IMMUTABLE_AUDIT_LOG: Capture Disposition Metadata
    note right of IMMUTABLE_AUDIT_LOG
        Mandatory Fields:
        - Disposition Reason (e.g., Reinvested, Savings)
        - Destination Account
        - Realized Interest & Early Penalty
        - Full JSON Snapshot of Pre-closure State
    end note

    IMMUTABLE_AUDIT_LOG --> ARCHIVED_DEPOSIT: Soft-Delete / Status Updated
    ARCHIVED_DEPOSIT --> [*]
```

---

### Diagram 4: Maturity Scanning & Proximity Alert Pipeline
The notification engine monitors deposit tenures against calendar boundaries to ensure investors are never caught unaware when deposits reach maturity.

```mermaid
flowchart TD
    StartScan(["Scan Trigger\n(Page Load / Manual / Scheduled Cron)"]) --> LoadActive["Query Active Deposits from Database"]
    LoadActive --> Loop{"For Each Deposit"}

    Loop --> CalcDelta["Calculate Days Remaining: t = MaturityDate - Today"]

    CalcDelta --> CheckToday{"t <= 0 ?"}
    CheckToday -- Yes --> TypeToday["Type: MATURED_TODAY\nSeverity: Critical (Red)"]
    CheckToday -- No --> Check7{"t <= 7 ?"}
    Check7 -- Yes --> Type7["Type: MATURING_7_DAYS\nSeverity: Warning (Amber)"]
    Check7 -- No --> Check14{"t <= 14 ?"}
    Check14 -- Yes --> Type14["Type: MATURING_14_DAYS\nSeverity: Info (Blue)"]
    Check14 -- No --> Check30{"t <= 30 ?"}
    Check30 -- Yes --> Type30["Type: MATURING_30_DAYS\nSeverity: Info (Slate)"]
    Check30 -- No --> Skip["No Alert Needed (Tenure > 30 Days)"]

    TypeToday --> Dedup{"Alert already logged\nfor this window today?"}
    Type7 --> Dedup
    Type14 --> Dedup
    Type30 --> Dedup

    Dedup -- Yes --> Ignore["Deduplicated (No-op)"]
    Dedup -- No --> RecordDB["Insert Notification Record in DB"]

    RecordDB --> InApp["Increment Navbar Unread Badge Counter"]
    RecordDB --> CheckWebhook{"WEBHOOK_URL Configured?"}

    CheckWebhook -- Yes --> FormatPayload["Format Payload (Discord / Slack / Generic)"]
    FormatPayload --> DispatchWebhook["POST JSON to Webhook URL (Timeout: 5s)"]
    CheckWebhook -- No --> Done(["Scan Complete"])
    DispatchWebhook --> Done
    Ignore --> Done
    Skip --> Done
```

---

## Quick Start Guide

### Prerequisites
- **Node.js**: `v18.18.0` or higher (tested on Node `v24.14.0`)
- **NPM**: `v9.0.0` or higher

### Installation & Execution in 4 Steps

1. **Clone and Install Dependencies**:
   ```bash
   git clone https://github.com/your-username/assetpulse.git
   cd assetpulse
   npm install
   ```

2. **Configure Environment**:
   ```bash
   cp .env.example .env
   ```
   *(By default, `.env` uses zero-config embedded SQLite `fintrack.db`.)*

3. **Prepare and Seed the Database**:
   ```bash
   npm run db:prep
   npm run db:push
   npm run db:seed
   ```

4. **Launch Development Server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

**Demo Credentials**:
- **Email**: `demo@assetpulse.dev`
- **Password**: `Password123!`

---

## Environment Variables Reference

| Variable | Required | Default | Description |
| :--- | :---: | :---: | :--- |
| `NODE_ENV` | No | `development` | Runtime environment (`development`, `production`, `test`) |
| `PORT` | No | `3000` | Port for the Next.js server |
| `DB_TYPE` | Yes | `sqlite` | Database engine dialect: `sqlite` or `mysql` |
| `DATABASE_URL` | Yes | `file:./fintrack.db` | Connection string for SQLite or external MySQL |
| `JWT_SECRET` | Yes | `assetpulse-secret...` | 256-bit secret used to sign session JWTs |
| `SESSION_MAX_AGE_SECONDS` | No | `604800` | Session lifetime in seconds (default: 7 days) |
| `WEBHOOK_TYPE` | No | `generic` | Webhook protocol: `discord`, `slack`, `telegram`, or `generic` |
| `WEBHOOK_URL` | No | `""` | Destination endpoint URL for outbound maturity notifications |
| `WEBHOOK_TIMEOUT_MS` | No | `5000` | Network timeout for outbound webhook requests |
| `CRON_SECRET` | No | `assetpulse-cron...` | Bearer token protecting the scheduled `/api/cron/maturity-check` route |

---

## Dual-Database Engine

### Option A: Embedded SQLite (Default Zero-Config)
No database installation or background daemon is required.
```env
DB_TYPE=sqlite
DATABASE_URL="file:./fintrack.db"
```
Execute `npm run db:prep && npm run db:push` to immediately create and synchronize `fintrack.db`.

### Option B: External MySQL Instance
To connect to an external MySQL server (Docker, RDS, PlanetScale, or local mysqld):
```env
DB_TYPE=mysql
DATABASE_URL="mysql://app_user:strong_password@localhost:3306/assetpulse"
```
Execute `npm run db:prep && npm run db:push`. The pre-step script automatically reconfigures Prisma's provider to MySQL and pushes the unified schema.

---

## Docker & Self-Hosting Guide

AssetPulse is fully containerized and production-ready.

### 1. Multi-Stage `Dockerfile`
```dockerfile
# Multi-stage production build
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN node scripts/db-prep.js
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

RUN chown -R nextjs:nodejs /app/prisma
USER nextjs

EXPOSE 3000
CMD ["npm", "start"]
```

### 2. `docker-compose.yml`
```yaml
version: '3.8'

services:
  assetpulse:
    build: .
    container_name: assetpulse-app
    restart: unless-stopped
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DB_TYPE=sqlite
      - DATABASE_URL=file:/app/prisma/fintrack.db
      - JWT_SECRET=replace-with-a-real-secret-32-chars-minimum
    volumes:
      - sqlite_data:/app/prisma

volumes:
  sqlite_data:
```

Launch with:
```bash
docker compose up -d
```

---

## Git Hygiene & Branching Standards

AssetPulse strictly adheres to release engineering best practices:

- **`main` Branch**: Reserved exclusively for production-ready, verified code. No direct feature development occurs on `main`.
- **`development` Branch**: The active integration branch where features are integrated and validated before release.
- **`feature/*` Branches**: Every individual capability or milestone is developed in an isolated feature branch (e.g., `feature/branding-and-db`, `feature/financial-engine`, `feature/auth`) before merging into `development`.

---

## Testing & Quality Verification

Run the test suite and quality gates:
```bash
# Run unit and integration tests
npm run test

# Run ESLint validation
npm run lint

# Compile and verify production build
npm run build
```

---

## License

AssetPulse is open-source software licensed under the [MIT License](LICENSE).
