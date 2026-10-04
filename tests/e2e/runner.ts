/**
 * AssetPulse Standalone E2E Test Suite Runner
 * 
 * Executes all 4 tiers of E2E tests:
 * - Tier 1: Feature Coverage (R1 through R6 in isolation)
 * - Tier 2: Boundary & Corner Cases
 * - Tier 3: Cross-Feature Combinations
 * - Tier 4: Real-World Application Scenarios
 * 
 * Can be run via:
 *   node --experimental-strip-types tests/e2e/runner.ts
 * or via:
 *   npx vitest run tests/e2e
 */

import { runAllTests } from './helpers/test-runner.ts';

// Import all test suites to register test cases
import './tier1-features/r1-branding-ui.test.ts';
import './tier1-features/r2-auth-security.test.ts';
import './tier1-features/r3-fd-portfolio-engine.test.ts';
import './tier1-features/r4-audit-closure.test.ts';
import './tier1-features/r5-maturity-notifications.test.ts';
import './tier1-features/r6-dual-database.test.ts';

import './tier2-boundary-corner/boundary-limits.test.ts';
import './tier3-cross-feature/cross-feature-flows.test.ts';
import './tier4-real-world/real-world-portfolio.test.ts';

async function main() {
  const result = await runAllTests();
  if (result.failed > 0) {
    console.error(`\x1b[31mE2E Test Run Finished with ${result.failed} failures.\x1b[0m`);
    process.exit(1);
  } else {
    console.log(`\x1b[32mAll ${result.total} E2E tests passed successfully!\x1b[0m`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
