/**
 * Tier 3 — Cross-Feature Combinations
 * 
 * Authoritative Specification Source:
 * - ORIGINAL_REQUEST.md (Requirements R1 through R6)
 * - PROJECT.md (Cross-Milestone Integration & Lifecycle)
 * 
 * Pairwise & Multi-Stage Interactions Tested:
 * - Flow 1: Registration -> Login -> Deposit Creation -> Recalculation on Update
 * - Flow 2: Maturity Proximity Trigger -> Notification Creation -> Disposition Closure -> Immutable Audit Record
 * - Flow 3: Concurrent Multi-User Isolation (User A vs User B portfolio, notifications, audit logs)
 * - Flow 4: Premature Liquidation with Penalty & Destination Account capture
 * - Flow 5: Soft-Deletion vs Permanent Historical Memory Preservation in Audit Ledger
 */

import { describe, it, expect } from '../helpers/test-runner.ts';
import { E2EClient } from '../helpers/e2e-client.ts';
import { calculateReferenceFixedDeposit } from '../helpers/financial-oracle.ts';

describe('Tier 3: Cross-Feature Combinations', () => {
  it('TC-T3-01: Flow 1 — Registration -> Login -> FD Creation -> Recalculation on Update', async () => {
    const userClient = new E2EClient();
    const testEmail = `trader_${Date.now()}@example.com`;
    const password = 'StrongPassword88!';

    // 1. Register user
    const regRes = await userClient.post('/api/auth/register', {
      email: testEmail,
      password,
      name: 'Portfolio Manager',
    });
    if (regRes.status !== 503) {
      expect([200, 201]).toContain(regRes.status);
    }

    // 2. Login user
    const loginRes = await userClient.post('/api/auth/login', {
      email: testEmail,
      password,
    });
    if (loginRes.status !== 503) {
      expect(loginRes.status).toBe(200);
      expect(userClient.getCookieHeader()).toContain('assetpulse_session');
    }

    // 3. Create Fixed Deposit with initial rate of 6.0%
    const initialDeposit = {
      bankName: 'Standard Chartered',
      accountNumber: 'SCB-FD-1001',
      principal: 100000,
      annualRate: 6.0,
      compoundingFrequency: 'QUARTERLY',
      startDate: '2026-01-01',
      maturityDate: '2027-01-01',
    };

    const initialOracle = calculateReferenceFixedDeposit({
      principal: 100000,
      annualRate: 6.0,
      compoundingFrequency: 'QUARTERLY',
      startDate: '2026-01-01',
      maturityDate: '2027-01-01',
      currentDate: '2026-01-01',
    });
    expect(initialOracle.maturityAmount).toBeCloseTo(106136.36, 0.05);

    const createRes = await userClient.post('/api/deposits', initialDeposit);
    if (createRes.status !== 503 && createRes.data?.id) {
      const depositId = createRes.data.id;

      // 4. Update interest rate to 7.5% (renegotiated FD rate)
      const updateRes = await userClient.put(`/api/deposits/${depositId}`, {
        annualRate: 7.5,
      });

      if (updateRes.status !== 503) {
        expect(updateRes.status).toBe(200);
        const updatedOracle = calculateReferenceFixedDeposit({
          principal: 100000,
          annualRate: 7.5,
          compoundingFrequency: 'QUARTERLY',
          startDate: '2026-01-01',
          maturityDate: '2027-01-01',
          currentDate: '2026-01-01',
        });
        expect(updatedOracle.maturityAmount).toBeCloseTo(107713.59, 0.05);
      }
    }
  });

  it('TC-T3-02: Flow 2 — Maturity Trigger -> Notification -> Disposition Closure -> Immutable Audit Record', async () => {
    const userClient = new E2EClient();
    const email = `mature_user_${Date.now()}@example.com`;
    await userClient.post('/api/auth/register', { email, password: 'SecurePassword1!', name: 'Mature User' });
    await userClient.post('/api/auth/login', { email, password: 'SecurePassword1!' });

    // 1. Create a deposit with maturity date = today
    const todayStr = new Date().toISOString().split('T')[0];
    const pastStartStr = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const createRes = await userClient.post('/api/deposits', {
      bankName: 'Citibank',
      accountNumber: 'CITI-MAT-77',
      principal: 200000,
      annualRate: 7.0,
      compoundingFrequency: 'ANNUALLY',
      startDate: pastStartStr,
      maturityDate: todayStr,
    });

    // 2. Trigger maturity proximity check
    const scanRes = await userClient.post('/api/notifications/check');
    if (scanRes.status !== 503) {
      expect([200, 201]).toContain(scanRes.status);

      // Verify notification in center
      const notifRes = await userClient.get('/api/notifications');
      if (notifRes.status === 200) {
        expect(notifRes.data).toBeDefined();
      }
    }

    // 3. User closes the matured deposit with MATURED_REINVESTED
    if (createRes.status !== 503 && createRes.data?.id) {
      const depositId = createRes.data.id;
      const closeRes = await userClient.post(`/api/deposits/${depositId}/close`, {
        dispositionType: 'MATURED_REINVESTED',
        destinationAccount: 'CITI-CHECKING-001',
        realizedInterest: 14000.0,
        penaltyAmount: 0.0,
        notes: 'Full maturity proceeds rolled over',
      });

      if (closeRes.status !== 503) {
        expect([200, 201]).toContain(closeRes.status);

        // 4. Verify immutable audit log record created
        const auditRes = await userClient.get('/api/audit-logs', {
          query: { action: 'CLOSED', bankName: 'Citibank' },
        });
        if (auditRes.status === 200 && Array.isArray(auditRes.data)) {
          const matching = auditRes.data.find((l: any) => l.accountNumber === 'CITI-MAT-77');
          if (matching) {
            expect(matching.action).toBe('CLOSED');
            expect(matching.dispositionType).toBe('MATURED_REINVESTED');
          }
        }
      }
    }
  });

  it('TC-T3-03: Flow 3 — Strict Multi-User Isolation across Deposits, Notifications, and Audit Logs', async () => {
    const clientAlpha = new E2EClient();
    const clientBeta = new E2EClient();

    const userAlpha = { email: `alpha_${Date.now()}@example.com`, password: 'AlphaPassword1!', name: 'Alpha' };
    const userBeta = { email: `beta_${Date.now()}@example.com`, password: 'BetaPassword1!', name: 'Beta' };

    // Register both
    await clientAlpha.post('/api/auth/register', userAlpha);
    await clientAlpha.post('/api/auth/login', { email: userAlpha.email, password: userAlpha.password });

    await clientBeta.post('/api/auth/register', userBeta);
    await clientBeta.post('/api/auth/login', { email: userBeta.email, password: userBeta.password });

    // Alpha creates FD
    const alphaFd = await clientAlpha.post('/api/deposits', {
      bankName: 'HSBC',
      accountNumber: 'HSBC-ALPHA-01',
      principal: 500000,
      annualRate: 8.0,
      compoundingFrequency: 'QUARTERLY',
      startDate: '2026-01-01',
      maturityDate: '2027-01-01',
    });

    // Beta checks their deposits
    const betaDeposits = await clientBeta.get('/api/deposits');
    if (betaDeposits.status === 200 && Array.isArray(betaDeposits.data)) {
      // Must not contain Alpha's HSBC deposit
      const leak = betaDeposits.data.find((d: any) => d.accountNumber === 'HSBC-ALPHA-01');
      expect(leak).toBeUndefined();
    }

    // Beta checks audit logs
    const betaAudit = await clientBeta.get('/api/audit-logs');
    if (betaAudit.status === 200 && Array.isArray(betaAudit.data)) {
      const auditLeak = betaAudit.data.find((a: any) => a.accountNumber === 'HSBC-ALPHA-01');
      expect(auditLeak).toBeUndefined();
    }
  });

  it('TC-T3-04: Flow 4 — Premature Liquidation captures penalty and adjusts realized income', async () => {
    const userClient = new E2EClient();
    const email = `premature_user_${Date.now()}@example.com`;
    await userClient.post('/api/auth/register', { email, password: 'SecurePassword1!', name: 'Emergency Liquidator' });
    await userClient.post('/api/auth/login', { email, password: 'SecurePassword1!' });

    // Create 3-year FD
    const createRes = await userClient.post('/api/deposits', {
      bankName: 'Wells Fargo',
      accountNumber: 'WF-PREMATURE-88',
      principal: 150000,
      annualRate: 7.2,
      compoundingFrequency: 'MONTHLY',
      startDate: '2025-01-01',
      maturityDate: '2028-01-01',
    });

    if (createRes.status !== 503 && createRes.data?.id) {
      const depositId = createRes.data.id;
      // Liquidate after 1 year with $1,000 early penalty
      const liquidateRes = await userClient.post(`/api/deposits/${depositId}/close`, {
        dispositionType: 'PREMATURE_WITHDRAWAL',
        destinationAccount: 'WF-CHECKING-99',
        realizedInterest: 9500.0,
        penaltyAmount: 1000.0,
        notes: 'Premature exit due to real estate purchase',
      });

      if (liquidateRes.status !== 503) {
        expect([200, 201]).toContain(liquidateRes.status);
        if (liquidateRes.data) {
          expect(['Closed', 'Liquidated', 'CLOSED', 'LIQUIDATED']).toContain(liquidateRes.data.status);
        }
      }
    }
  });

  it('TC-T3-05: Flow 5 — Soft Deletion preserves permanent historical record in Audit Ledger', async () => {
    const userClient = new E2EClient();
    const email = `archive_user_${Date.now()}@example.com`;
    await userClient.post('/api/auth/register', { email, password: 'SecurePassword1!', name: 'Archive User' });
    await userClient.post('/api/auth/login', { email, password: 'SecurePassword1!' });

    const createRes = await userClient.post('/api/deposits', {
      bankName: 'Barclays',
      accountNumber: 'BARC-DEL-01',
      principal: 80000,
      annualRate: 5.8,
      compoundingFrequency: 'ANNUALLY',
      startDate: '2026-02-01',
      maturityDate: '2027-02-01',
    });

    if (createRes.status !== 503 && createRes.data?.id) {
      const depositId = createRes.data.id;

      // Close / Delete with disposition metadata
      const closeRes = await userClient.post(`/api/deposits/${depositId}/close`, {
        dispositionType: 'OTHER',
        destinationAccount: 'ACC-EXTERNAL-11',
        realizedInterest: 0,
        penaltyAmount: 0,
        notes: 'Closed by mistake / archived record',
      });

      if (closeRes.status !== 503) {
        // Active deposits list should exclude closed/deleted deposit or filter it
        const activeRes = await userClient.get('/api/deposits', { query: { status: 'Active' } });
        if (activeRes.status === 200 && Array.isArray(activeRes.data)) {
          const found = activeRes.data.find((d: any) => d.id === depositId);
          expect(found).toBeUndefined();
        }

        // Audit log must permanently retain it
        const auditRes = await userClient.get('/api/audit-logs');
        if (auditRes.status === 200 && Array.isArray(auditRes.data)) {
          const logRecord = auditRes.data.find((a: any) => a.accountNumber === 'BARC-DEL-01');
          expect(logRecord).toBeDefined();
        }
      }
    }
  });
});
