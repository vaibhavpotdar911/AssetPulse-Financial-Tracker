# AssetPulse Test Infrastructure (`TEST_INFRA.md`)

This document defines the automated End-to-End (E2E) testing architecture, testing philosophy, runner configurations, and feature coverage matrix for **AssetPulse**.

---

## 1. Test Philosophy

The AssetPulse test suite adheres to a rigorous **opaque-box, requirement-driven, and progressive testability** philosophy:

1. **Opaque-Box Verification**:
   - Tests interact exclusively with the system via external interfaces: public HTTP endpoints, HTTP-only session cookies (`assetpulse_session`), filesystem artifacts (`logo.jpg`, `LICENSE`, `README.md`), and database files (`fintrack.db`).
   - Tests do not depend on internal private functions or transient implementation details. If the underlying framework or ORM changes, the opaque-box test suite remains authoritative.

2. **Authoritative Mathematical Oracle**:
   - Every financial calculation is derived from first principles according to standard compound interest formulas:
     $$A = P \times \left(1 + \frac{r}{n}\right)^{n \times t} \quad \text{and} \quad A = P \times (1 + r \times t)$$
   - The test suite includes an independent reference oracle (`tests/e2e/helpers/financial-oracle.ts`) that calculates expected values for monthly, quarterly, semi-annually, annually, and at-maturity compounding.
   - Strict currency unit tolerance: all monetary comparisons enforce the mandatory $\pm 0.01$ tolerance.

3. **Multi-Tenant Session Isolation**:
   - The E2E HTTP client (`tests/e2e/helpers/e2e-client.ts`) implements an isolated cookie jar per client instance.
   - Tests verify that User A cannot read, update, delete, or inspect the deposits, notifications, or audit logs of User B.

4. **Zero-Dependency Resilience**:
   - The suite features a dual-mode test runner adapter (`tests/e2e/helpers/test-runner.ts`) that runs seamlessly under **Vitest** when installed, and natively under **Node.js 24** (`node --experimental-strip-types`) with zero third-party dependencies.

---

## 2. Test Architecture & Directory Layout

```
FinTrack/
├── tests/
│   ├── setup.ts                               # Vitest global environment setup
│   └── e2e/
│       ├── runner.ts                          # Master test runner script
│       ├── helpers/
│       │   ├── test-runner.ts                 # Universal describe/it/expect assertion adapter
│       │   ├── e2e-client.ts                  # Cookie-aware HTTP client
│       │   ├── financial-oracle.ts            # Mathematical compound interest oracle (±0.01)
│       │   └── db-helper.ts                   # SQLite and Prisma schema inspection helper
│       ├── tier1-features/                    # Tier 1: Feature Coverage (>=5 tests per feature)
│       │   ├── r1-branding-ui.test.ts         # R1 Branding, UI/UX & Open-Source Architecture
│       │   ├── r2-auth-security.test.ts       # R2 Authentication & Authorization
│       │   ├── r3-fd-portfolio-engine.test.ts # R3 Fixed Deposits Portfolio & Financial Engine
│       │   ├── r4-audit-closure.test.ts       # R4 Immutable Audit Logs & Closure Ledger
│       │   ├── r5-maturity-notifications.test.ts # R5 Maturity Tracking & Notification Engine
│       │   └── r6-dual-database.test.ts       # R6 Dual-Database Connectivity (SQLite/MySQL)
│       ├── tier2-boundary-corner/             # Tier 2: Boundary & Corner Cases
│       │   └── boundary-limits.test.ts        # Zero rates, micro tenures, leap years, scaling
│       ├── tier3-cross-feature/               # Tier 3: Cross-Feature Combinations
│       │   └── cross-feature-flows.test.ts    # Pairwise multi-step end-to-end user journeys
│       └── tier4-real-world/                  # Tier 4: Real-World Application Scenarios
│           └── real-world-portfolio.test.ts   # Multi-bank household portfolios & liquidations
├── TEST_INFRA.md                              # This specification
└── TEST_READY.md                              # Test readiness & execution contract
```

---

## 3. Four-Tier Testing Methodology

| Tier | Focus | Scope & Criteria | Test Count |
| :--- | :--- | :--- | :--- |
| **Tier 1: Feature Coverage** | Requirements R1–R6 in isolation | Verifies each feature independently (Branding, Auth, Portfolio & Math, Audit Ledger, Notifications, Dual DB). Each requirement has at least 5 isolated test cases. | **30 tests** |
| **Tier 2: Boundary & Corner Cases** | Extreme limits & boundary conditions | Tests $r = 0.0\%$, micro-tenures (1, 7, 15 days), leap year transitions (366 days, Feb 29), same-day maturities ($t = 0$), $1B+ principal scaling, malformed tokens, 404 enumeration resistance. | **8 tests** |
| **Tier 3: Cross-Feature Combinations** | Multi-feature lifecycle flows | Multi-step integration flows: Auth -> FD Creation -> Recalculation; Maturity Trigger -> Notification -> Close -> Audit Log; Multi-tenant cross-isolation; Premature Liquidation with penalty; Soft-delete vs audit retention. | **5 tests** |
| **Tier 4: Real-World Scenarios** | Complex user scenarios | Multi-bank household portfolio aggregation across 4 institutions, emergency liquidation event, fiscal year-end audit inspection, maturity rollover flow, webhook fault-tolerance under HTTP 500. | **5 tests** |
| **Total** | **Comprehensive E2E Suite** | **Complete coverage across all requirements** | **48 tests** |

---

## 4. Feature Inventory Coverage Matrix

| Feature # | Feature Name | Requirement | Tier | Test File | Test Case IDs | Status |
| :---: | :--- | :---: | :---: | :--- | :--- | :---: |
| **1** | AssetPulse Brand Logo | R1 | Tier 1 | `tier1-features/r1-branding-ui.test.ts` | TC-R1-01 | **PASSED** |
| **2** | Responsive Layout Shell | R1 | Tier 1 | `tier1-features/r1-branding-ui.test.ts` | TC-R1-05 | **PASSED** |
| **3** | Dark/Light Theme System | R1 | Tier 1 | `tier1-features/r1-branding-ui.test.ts` | TC-R1-04 | **PASSED** |
| **4** | MIT License & README | R1 | Tier 1 | `tier1-features/r1-branding-ui.test.ts` | TC-R1-02, TC-R1-03 | **PASSED** |
| **5** | Zero-Config SQLite | R6 | Tier 1 | `tier1-features/r6-dual-database.test.ts` | TC-R6-01 | **PASSED** |
| **6** | MySQL Toggle | R6 | Tier 1 | `tier1-features/r6-dual-database.test.ts` | TC-R6-05 | **PASSED** |
| **7** | Unified Prisma Schema | R6 | Tier 1 | `tier1-features/r6-dual-database.test.ts` | TC-R6-02 | **PASSED** |
| **8** | DB Prep Script | R6 | Tier 1 | `tier1-features/r6-dual-database.test.ts` | TC-R6-03 | **PASSED** |
| **9** | Database Seeder | R6 | Tier 1 | `tier1-features/r6-dual-database.test.ts` | TC-R6-04 | **PASSED** |
| **11** | Quarterly/Annual Compounding | R3 | Tier 1 | `tier1-features/r3-fd-portfolio-engine.test.ts` | TC-R3-02 | **PASSED** |
| **12** | At-Maturity Interest | R3 | Tier 1 | `tier1-features/r3-fd-portfolio-engine.test.ts` | TC-R3-04 | **PASSED** |
| **13** | Maturity Payout & Interest | R3 | Tier 1 | `tier1-features/r3-fd-portfolio-engine.test.ts` | TC-R3-02, TC-R3-03 | **PASSED** |
| **14** | Accrued Interest to Date | R3 | Tier 1 | `tier1-features/r3-fd-portfolio-engine.test.ts` | TC-R3-05 | **PASSED** |
| **15** | Days Remaining & Progress | R3 | Tier 1 | `tier1-features/r3-fd-portfolio-engine.test.ts` | TC-R3-05 | **PASSED** |
| **16** | Currency Rounding $\pm 0.01$ | R3 | Tier 1 | `tier1-features/r3-fd-portfolio-engine.test.ts` | TC-R3-02, TC-R3-03 | **PASSED** |
| **18** | User Registration API | R2 | Tier 1 | `tier1-features/r2-auth-security.test.ts` | TC-R2-01 | **PASSED** |
| **19** | User Login & Password Hashing | R2 | Tier 1 | `tier1-features/r2-auth-security.test.ts` | TC-R2-02 | **PASSED** |
| **20** | Session Cookie Management | R2 | Tier 1 | `tier1-features/r2-auth-security.test.ts` | TC-R2-02, TC-R2-03 | **PASSED** |
| **21** | User Logout API | R2 | Tier 1 | `tier1-features/r2-auth-security.test.ts` | TC-R2-03 | **PASSED** |
| **22** | Current User Profile API | R2 | Tier 1 | `tier1-features/r2-auth-security.test.ts` | TC-R2-03 | **PASSED** |
| **23** | Route Guard Protection | R2 | Tier 1 | `tier1-features/r2-auth-security.test.ts` | TC-R2-04 | **PASSED** |
| **24** | Multi-Tenant Data Isolation | R2 | Tier 1 | `tier1-features/r2-auth-security.test.ts` | TC-R2-05 | **PASSED** |
| **26** | FD CRUD API Validation | R3 | Tier 1 | `tier1-features/r3-fd-portfolio-engine.test.ts` | TC-R3-01 | **PASSED** |
| **28** | Disposition Closure API | R4 | Tier 1 | `tier1-features/r4-audit-closure.test.ts` | TC-R4-01, TC-R4-02 | **PASSED** |
| **29** | Immutable Audit Log Record | R4 | Tier 1 | `tier1-features/r4-audit-closure.test.ts` | TC-R4-02, TC-R4-04 | **PASSED** |
| **30** | Audit Log Query & Filtering | R4 | Tier 1 | `tier1-features/r4-audit-closure.test.ts` | TC-R4-05 | **PASSED** |
| **34** | Maturity Proximity Scanner | R5 | Tier 1 | `tier1-features/r5-maturity-notifications.test.ts` | TC-R5-01 | **PASSED** |
| **35** | Notification Deduplication | R5 | Tier 1 | `tier1-features/r5-maturity-notifications.test.ts` | TC-R5-04 | **PASSED** |
| **36** | In-App Notification Center | R5 | Tier 1 | `tier1-features/r5-maturity-notifications.test.ts` | TC-R5-02, TC-R5-03 | **PASSED** |
| **38** | Scheduled / On-Demand Check | R5 | Tier 1 | `tier1-features/r5-maturity-notifications.test.ts` | TC-R5-04 | **PASSED** |
| **39** | Multi-Channel Webhook | R5 | Tier 1 | `tier1-features/r5-maturity-notifications.test.ts` | TC-R5-05 | **PASSED** |
| **All** | Boundary Limits & Micro-Tenure | R3 | Tier 2 | `tier2-boundary-corner/boundary-limits.test.ts` | TC-T2-01, TC-T2-02, TC-T2-03, TC-T2-04, TC-T2-05, TC-T2-06 | **PASSED** |
| **All** | Auth Edge Cases & 404 Guard | R2 | Tier 2 | `tier2-boundary-corner/boundary-limits.test.ts` | TC-T2-07, TC-T2-08 | **PASSED** |
| **All** | Cross-Feature Interactions | R1–R6 | Tier 3 | `tier3-cross-feature/cross-feature-flows.test.ts` | TC-T3-01, TC-T3-02, TC-T3-03, TC-T3-04, TC-T3-05 | **PASSED** |
| **All** | Real-World Application Scenarios | R1–R6 | Tier 4 | `tier4-real-world/real-world-portfolio.test.ts` | TC-T4-01, TC-T4-02, TC-T4-03, TC-T4-04, TC-T4-05 | **PASSED** |

---

## 5. Execution Guide

### Primary Standalone Execution (Zero-Dependency Node 24 Runner)
```bash
node --experimental-strip-types tests/e2e/runner.ts
```
- **Exit Code**: `0` on success, `1` on failure.
- **Runtime Duration**: ~250–350ms.

### Vitest Runner Execution (When dependencies installed)
```bash
npx vitest run tests/e2e
```
or:
```bash
npm run test:e2e
```
