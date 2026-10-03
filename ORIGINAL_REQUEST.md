# Original User Request

## 2026-10-03T18:48:40Z

AssetPulse is an open-source, lightweight personal financial asset tracking web application built with Next.js and Node.js. It specializes in tracking Fixed Deposits (FDs) with automated maturity calculations, alerts, immutable audit-logging of deletions/closures, secure authentication, and flexible database connectivity (zero-config local SQLite with instant toggle to external MySQL).

Working directory: /Users/vaibhavpotdar/Desktop/FinTrack
Integrity mode: development

Logo asset available at: /Users/vaibhavpotdar/Desktop/FinTrack/logo.jpg

## Requirements

### R1. Branding, UI/UX & Open-Source Architecture
- Built as an open-source Next.js (TypeScript) web application with Node.js backend API routes.
- Styled using modern industry standards (Tailwind CSS, clean component system, Lucide icons) incorporating the **AssetPulse** logo, brand palette (emerald & indigo), dark/light mode support, and responsive layouts.
- Includes open-source artifacts: `LICENSE` (MIT), comprehensive `README.md` with architecture diagrams, quick-start setup, environment variable documentation, and instructions for forking and self-hosting.

### R2. Authentication & Authorization
- Robust user authentication supporting registration, secure login, password hashing (bcrypt/argon2), and session or JWT-based token management.
- Complete data isolation per authenticated user; protected API endpoints and route guards blocking unauthorized access.

### R3. Fixed Deposits Portfolio & Financial Engine
- Complete CRUD operations for Fixed Deposits:
  - Bank/Institution name, Account/Certificate number, Principal amount, Annual interest rate (%), Compounding frequency (monthly, quarterly, semi-annually, annually, at maturity), Deposit start date, Tenure / Maturity date.
- Financial calculation engine accurately computing:
  - Total maturity payout amount.
  - Total interest earned.
  - Current accrued interest to date.
  - Days remaining until maturity and visual progress indicator.
- Support status lifecycle: Active, Matured, Closed, Liquidated.

### R4. Immutable Audit Logs & Closure Ledger
- Whenever a Fixed Deposit is closed, liquidated, or deleted, the system requires capturing disposition metadata:
  - Reason / Disposition type (e.g., Matured & Reinvested, Transferred to Savings, Early Premature Withdrawal).
  - Payout destination account or notes.
  - Final realized interest and penalty (if premature).
- Records must be written to an immutable Audit Log table/view so users maintain a permanent financial memory of all historic funds.
- Dedicated Audit Log viewer UI with filtering by date, bank, and action type.

### R5. Maturity Tracking & Notification Engine
- In-app notification center (bell badge with count, dropdown notification list, and mark-as-read capability).
- Dashboard alert banners highlighting deposits maturing within 7/14/30 days and deposits that have matured today.
- Scheduled or on-load maturity checker that scans active deposits and dispatches alerts.
- Configurable notification webhook (Discord / Telegram / Slack / generic webhook) or email notification stub enabled via environment variables.

### R6. Dual-Database Connectivity (SQLite & MySQL)
- Lightweight by default: Out-of-the-box zero-configuration embedded SQLite database (`fintrack.db`) for immediate local run without installing database servers.
- External MySQL support: Ability to switch to an existing MySQL instance simply by configuring `DATABASE_URL` (or `DB_TYPE=mysql`) in `.env`.
- Database schema managed via ORM (Prisma or Drizzle) with migrations and database seed script for sample data.

### R7. Repository Setup & Git Branching Standards
- Initialize Git repository adhering to proper release hygiene:
  - `main` branch preserved for production-ready code.
  - `development` branch created as the active integration branch.
  - Feature branches created for individual components during development.

---

## Acceptance Criteria

### Authentication & Security
- [ ] Users can register an account, log in with validated credentials, receive a secure session, and log out.
- [ ] Unauthenticated requests to private API routes or dashboards return 401/302 redirects.
- [ ] User data is strictly isolated: User A cannot read or mutate User B's deposits or audit logs.

### Fixed Deposits & Calculations
- [ ] User can create, view, update, and filter fixed deposits across banks.
- [ ] Maturity amount and accrued interest calculations match standard compound interest formulas within a tolerance of ±0.01.
- [ ] Deposit details display days to maturity, progress bar, and active status accurately.

### Audit Logging
- [ ] Attempting to delete or close a deposit prompts for disposition details (reason, destination account, final amount).
- [ ] Closure/deletion creates an immutable audit record and updates or soft-deletes the deposit.
- [ ] Audit log view shows timestamps, previous principal, interest earned, bank, action, and disposition notes.

### Notifications
- [ ] Deposits maturing within 30 days and deposits matured today trigger notifications in the in-app notification center.
- [ ] Notification badge count updates dynamically, and users can mark notifications as read.
- [ ] Webhook trigger function executes successfully when simulated or configured with a test endpoint.

### Dual-Database Compatibility
- [ ] Application starts cleanly and passes all tests using local SQLite without needing external services.
- [ ] Switching `DATABASE_URL` to a MySQL connection string enables the app to run against MySQL schema seamlessly.

### Testing & Verification
- [ ] Automated test suite (Vitest / Jest) passes for:
  - Compound interest & maturity date calculations.
  - Auth token validation and route authorization.
  - Fixed deposit creation, closure, and audit log generation.
  - SQLite database migration and query operations.
- [ ] `npm run lint` and `npm run build` execute with zero errors.
