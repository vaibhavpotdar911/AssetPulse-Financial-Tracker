/**
 * Universal Test Runner & Assertion Adapter
 * 
 * Provides an identical API to Vitest / Jest:
 *   describe, it, test, expect, beforeAll, afterAll, beforeEach, afterEach
 * 
 * Works seamlessly in two modes:
 * 1. Under Vitest (`npx vitest run tests/e2e`): delegates directly to Vitest globals.
 * 2. Standalone under Node 24 (`node --experimental-strip-types tests/e2e/runner.ts`):
 *    zero external dependencies, using built-in assertions and test harness.
 */

import assert from 'node:assert';

// Check if running inside Vitest environment
const isVitest = typeof (globalThis as any).describe === 'function' && typeof (globalThis as any).it === 'function';

export interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  error?: Error;
  durationMs: number;
}

export interface RunnerState {
  currentSuite: string;
  results: TestResult[];
  beforeAllHooks: Array<() => Promise<void> | void>;
  afterAllHooks: Array<() => Promise<void> | void>;
  beforeEachHooks: Array<() => Promise<void> | void>;
  afterEachHooks: Array<() => Promise<void> | void>;
  testsToRun: Array<{ suite: string; name: string; fn: () => Promise<void> | void }>;
}

export const runnerState: RunnerState = {
  currentSuite: '',
  results: [],
  beforeAllHooks: [],
  afterAllHooks: [],
  beforeEachHooks: [],
  afterEachHooks: [],
  testsToRun: [],
};

// 1. Describe Block
export const describe = (name: string, fn: () => void | Promise<void>): void => {
  if (isVitest) {
    (globalThis as any).describe(name, fn);
    return;
  }
  const prevSuite = runnerState.currentSuite;
  runnerState.currentSuite = prevSuite ? `${prevSuite} > ${name}` : name;
  try {
    fn();
  } finally {
    runnerState.currentSuite = prevSuite;
  }
};

// 2. Test / It Block
export const it = (name: string, fn: () => Promise<void> | void): void => {
  if (isVitest) {
    (globalThis as any).it(name, fn);
    return;
  }
  runnerState.testsToRun.push({
    suite: runnerState.currentSuite || 'Default Suite',
    name,
    fn,
  });
};

export const test = it;

// 3. Lifecycle Hooks
export const beforeAll = (fn: () => Promise<void> | void): void => {
  if (isVitest) {
    (globalThis as any).beforeAll(fn);
    return;
  }
  runnerState.beforeAllHooks.push(fn);
};

export const afterAll = (fn: () => Promise<void> | void): void => {
  if (isVitest) {
    (globalThis as any).afterAll(fn);
    return;
  }
  runnerState.afterAllHooks.push(fn);
};

export const beforeEach = (fn: () => Promise<void> | void): void => {
  if (isVitest) {
    (globalThis as any).beforeEach(fn);
    return;
  }
  runnerState.beforeEachHooks.push(fn);
};

export const afterEach = (fn: () => Promise<void> | void): void => {
  if (isVitest) {
    (globalThis as any).afterEach(fn);
    return;
  }
  runnerState.afterEachHooks.push(fn);
};

// 4. Expect Assertion Builder
export function expect(actual: any) {
  if (isVitest) {
    return (globalThis as any).expect(actual);
  }

  return {
    toBe(expected: any) {
      assert.strictEqual(actual, expected, `Expected ${JSON.stringify(actual)} to be ${JSON.stringify(expected)}`);
    },
    toEqual(expected: any) {
      assert.deepStrictEqual(actual, expected, `Expected ${JSON.stringify(actual)} to deep-equal ${JSON.stringify(expected)}`);
    },
    toBeCloseTo(expected: number, delta: number = 0.01) {
      const diff = Math.abs(actual - expected);
      assert.ok(
        diff <= delta + 1e-9,
        `Expected ${actual} to be close to ${expected} within delta ±${delta} (actual diff: ${diff})`
      );
    },
    toBeGreaterThan(expected: number) {
      assert.ok(actual > expected, `Expected ${actual} to be greater than ${expected}`);
    },
    toBeGreaterThanOrEqual(expected: number) {
      assert.ok(actual >= expected, `Expected ${actual} to be greater than or equal to ${expected}`);
    },
    toBeLessThan(expected: number) {
      assert.ok(actual < expected, `Expected ${actual} to be less than ${expected}`);
    },
    toBeLessThanOrEqual(expected: number) {
      assert.ok(actual <= expected, `Expected ${actual} to be less than or equal to ${expected}`);
    },
    toHaveLength(expectedLength: number) {
      const length = actual?.length ?? actual?.size;
      assert.strictEqual(
        length,
        expectedLength,
        `Expected entity to have length ${expectedLength}, but got ${length}`
      );
    },
    toBeTruthy() {
      assert.ok(Boolean(actual), `Expected ${actual} to be truthy`);
    },
    toBeFalsy() {
      assert.ok(!Boolean(actual), `Expected ${actual} to be falsy`);
    },
    toBeNull() {
      assert.strictEqual(actual, null, `Expected ${actual} to be null`);
    },
    toBeUndefined() {
      assert.strictEqual(actual, undefined, `Expected ${actual} to be undefined`);
    },
    toBeDefined() {
      assert.notStrictEqual(actual, undefined, `Expected value to be defined`);
    },
    toContain(expectedSubstringOrItem: any) {
      if (typeof actual === 'string') {
        assert.ok(
          actual.includes(expectedSubstringOrItem),
          `Expected string "${actual}" to contain "${expectedSubstringOrItem}"`
        );
      } else if (Array.isArray(actual)) {
        assert.ok(
          actual.includes(expectedSubstringOrItem),
          `Expected array to contain item ${JSON.stringify(expectedSubstringOrItem)}`
        );
      } else {
        throw new Error(`toContain called on unsupported type: ${typeof actual}`);
      }
    },
    toMatch(regex: RegExp) {
      assert.ok(regex.test(String(actual)), `Expected "${actual}" to match pattern ${regex}`);
    },
    toThrow(expectedErrorPattern?: string | RegExp) {
      assert.throws(
        () => {
          if (typeof actual === 'function') {
            actual();
          } else {
            throw new Error(`actual is not a function`);
          }
        },
        expectedErrorPattern ? new RegExp(expectedErrorPattern) : undefined
      );
    },
    not: {
      toBe(expected: any) {
        assert.notStrictEqual(actual, expected, `Expected ${actual} not to be ${expected}`);
      },
      toEqual(expected: any) {
        assert.notDeepStrictEqual(actual, expected, `Expected ${actual} not to deep-equal ${expected}`);
      },
      toContain(expectedSubstringOrItem: any) {
        if (typeof actual === 'string') {
          assert.ok(
            !actual.includes(expectedSubstringOrItem),
            `Expected string "${actual}" NOT to contain "${expectedSubstringOrItem}"`
          );
        } else if (Array.isArray(actual)) {
          assert.ok(
            !actual.includes(expectedSubstringOrItem),
            `Expected array NOT to contain item ${JSON.stringify(expectedSubstringOrItem)}`
          );
        }
      },
      toBeNull() {
        assert.notStrictEqual(actual, null, `Expected ${actual} not to be null`);
      },
      toBeUndefined() {
        assert.notStrictEqual(actual, undefined, `Expected ${actual} not to be undefined`);
      },
      toBeTruthy() {
        assert.ok(!Boolean(actual), `Expected ${actual} not to be truthy`);
      },
      toBeFalsy() {
        assert.ok(Boolean(actual), `Expected ${actual} not to be falsy`);
      },
    },
  };
}

// 5. Standalone Execution Harness
export async function runAllTests(): Promise<{ passed: number; failed: number; total: number; durationMs: number }> {
  const startTime = Date.now();
  console.log('\n======================================================');
  console.log('🚀 Running AssetPulse Opaque-Box E2E Test Suite');
  console.log('======================================================\n');

  // Execute beforeAll hooks
  for (const hook of runnerState.beforeAllHooks) {
    await hook();
  }

  let passed = 0;
  let failed = 0;

  for (const t of runnerState.testsToRun) {
    const testStart = Date.now();
    try {
      // Execute beforeEach hooks
      for (const hook of runnerState.beforeEachHooks) {
        await hook();
      }

      await t.fn();

      // Execute afterEach hooks
      for (const hook of runnerState.afterEachHooks) {
        await hook();
      }

      const durationMs = Date.now() - testStart;
      runnerState.results.push({
        suite: t.suite,
        name: t.name,
        passed: true,
        durationMs,
      });
      passed++;
      console.log(`  ✓ \x1b[32mPASS\x1b[0m [${t.suite}] ${t.name} (${durationMs}ms)`);
    } catch (err: any) {
      const durationMs = Date.now() - testStart;
      runnerState.results.push({
        suite: t.suite,
        name: t.name,
        passed: false,
        error: err,
        durationMs,
      });
      failed++;
      console.log(`  ✗ \x1b[31mFAIL\x1b[0m [${t.suite}] ${t.name} (${durationMs}ms)`);
      console.log(`    \x1b[31mError:\x1b[0m ${err.message}`);
      if (err.stack) {
        console.log(`    ${err.stack.split('\n').slice(1, 4).join('\n    ')}`);
      }
    }
  }

  // Execute afterAll hooks
  for (const hook of runnerState.afterAllHooks) {
    try {
      await hook();
    } catch (e: any) {
      console.error(`Error in afterAll hook: ${e.message}`);
    }
  }

  const total = passed + failed;
  const totalDuration = Date.now() - startTime;

  console.log('\n------------------------------------------------------');
  console.log(`E2E Summary: ${passed} passed, ${failed} failed, ${total} total (${totalDuration}ms)`);
  console.log('------------------------------------------------------\n');

  return { passed, failed, total, durationMs: totalDuration };
}
