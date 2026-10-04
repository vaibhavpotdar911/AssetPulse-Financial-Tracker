/**
 * AssetPulse - Cross-Platform Database Seed Script
 * 
 * Populates sample portfolio data for demo user across all key maturity stages:
 * - Active (Healthy tenure, ~6 months remaining)
 * - Active (Maturing in 5 days - 7-day proximity alert)
 * - Active (Maturing in 12 days - 14-day proximity alert)
 * - Active (Maturing in 26 days - 30-day proximity alert)
 * - Matured Today (Requires immediate renewal/disposition)
 * - Closed (Historic deposit with Matured & Reinvested audit log)
 * - Liquidated (Historic deposit with Premature Withdrawal & penalty audit log)
 * 
 * Works cleanly on both SQLite and MySQL.
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Helper to calculate date offsets relative to today
function dateOffset(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(12, 0, 0, 0); // Normalized noon timestamp
  return d;
}

async function main() {
  console.log('[AssetPulse Seed] Starting database seeding...');

  // 1. Clean existing records in referential integrity order
  console.log('[AssetPulse Seed] Cleaning existing database records...');
  await prisma.notification.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.fixedDeposit.deleteMany();
  await prisma.user.deleteMany();

  // 2. Create Demo User
  console.log('[AssetPulse Seed] Creating demo user...');
  const passwordHash = bcrypt.hashSync('Password123!', 10);
  const demoUser = await prisma.user.create({
    data: {
      email: 'demo@assetpulse.dev',
      name: 'Alex Mercer',
      password: passwordHash,
    },
  });
  console.log(`[AssetPulse Seed] Created user: ${demoUser.email} (ID: ${demoUser.id})`);

  // 3. Seed Fixed Deposits Across Maturity Horizons
  console.log('[AssetPulse Seed] Creating sample fixed deposits...');

  // FD 1: Active Healthy Tenure (~6 months remaining)
  const fdHealthy = await prisma.fixedDeposit.create({
    data: {
      userId: demoUser.id,
      bankName: 'HDFC Bank',
      accountNumber: 'HDFC-FD-984210',
      principalAmount: 100000.0,
      annualRate: 7.25,
      compoundingFrequency: 'QUARTERLY',
      startDate: dateOffset(-180),
      maturityDate: dateOffset(185),
      maturityAmount: 107449.03,
      totalInterestEarned: 7449.03,
      status: 'ACTIVE',
      isAutoRenew: false,
      notes: 'Emergency fund fixed deposit in HDFC premier account.',
    },
  });

  // FD 2: Active Maturing in 5 Days (Triggers 7-day proximity alert)
  const fd5Days = await prisma.fixedDeposit.create({
    data: {
      userId: demoUser.id,
      bankName: 'State Bank of India',
      accountNumber: 'SBI-FD-771204',
      principalAmount: 250000.0,
      annualRate: 7.0,
      compoundingFrequency: 'QUARTERLY',
      startDate: dateOffset(-360),
      maturityDate: dateOffset(5),
      maturityAmount: 267968.75,
      totalInterestEarned: 17968.75,
      status: 'ACTIVE',
      isAutoRenew: true,
      notes: '1-year SBI term deposit maturing this week.',
    },
  });

  // FD 3: Active Maturing in 12 Days (Triggers 14-day proximity alert)
  const fd12Days = await prisma.fixedDeposit.create({
    data: {
      userId: demoUser.id,
      bankName: 'ICICI Bank',
      accountNumber: 'ICICI-FD-339102',
      principalAmount: 150000.0,
      annualRate: 7.1,
      compoundingFrequency: 'MONTHLY',
      startDate: dateOffset(-353),
      maturityDate: dateOffset(12),
      maturityAmount: 161001.3,
      totalInterestEarned: 11001.3,
      status: 'ACTIVE',
      isAutoRenew: false,
      notes: 'Tax saver monthly compounding deposit.',
    },
  });

  // FD 4: Active Maturing in 26 Days (Triggers 30-day proximity alert)
  const fd26Days = await prisma.fixedDeposit.create({
    data: {
      userId: demoUser.id,
      bankName: 'Axis Bank',
      accountNumber: 'AXIS-FD-551093',
      principalAmount: 75000.0,
      annualRate: 7.4,
      compoundingFrequency: 'QUARTERLY',
      startDate: dateOffset(-339),
      maturityDate: dateOffset(26),
      maturityAmount: 80708.2,
      totalInterestEarned: 5708.2,
      status: 'ACTIVE',
      isAutoRenew: false,
      notes: 'High-yield quarterly term deposit.',
    },
  });

  // FD 5: Matured Today (Critical renewal required)
  const fdMaturedToday = await prisma.fixedDeposit.create({
    data: {
      userId: demoUser.id,
      bankName: 'Kotak Mahindra Bank',
      accountNumber: 'KOTAK-FD-448201',
      principalAmount: 200000.0,
      annualRate: 7.5,
      compoundingFrequency: 'ANNUALLY',
      startDate: dateOffset(-365),
      maturityDate: dateOffset(0),
      maturityAmount: 215000.0,
      totalInterestEarned: 15000.0,
      status: 'MATURED',
      isAutoRenew: false,
      notes: 'Matured today. Decision pending on reinvestment or savings transfer.',
    },
  });

  // FD 6: Closed Historic Deposit (Matured & Reinvested)
  const fdClosed = await prisma.fixedDeposit.create({
    data: {
      userId: demoUser.id,
      bankName: 'HDFC Bank',
      accountNumber: 'HDFC-FD-110482',
      principalAmount: 50000.0,
      annualRate: 6.8,
      compoundingFrequency: 'QUARTERLY',
      startDate: dateOffset(-730),
      maturityDate: dateOffset(-365),
      maturityAmount: 53488.22,
      totalInterestEarned: 3488.22,
      status: 'CLOSED',
      isAutoRenew: false,
      notes: 'Matured deposit, rolled into HDFC-FD-984210.',
    },
  });

  // FD 7: Liquidated Historic Deposit (Prematurely withdrawn with penalty)
  const fdLiquidated = await prisma.fixedDeposit.create({
    data: {
      userId: demoUser.id,
      bankName: 'Citibank',
      accountNumber: 'CITI-FD-883019',
      principalAmount: 40000.0,
      annualRate: 6.5,
      compoundingFrequency: 'AT_MATURITY',
      startDate: dateOffset(-300),
      maturityDate: dateOffset(-65),
      maturityAmount: 42600.0,
      totalInterestEarned: 2600.0,
      status: 'LIQUIDATED',
      isAutoRenew: false,
      notes: 'Liquidated early due to medical emergency.',
    },
  });

  // 4. Seed Immutable Audit Logs
  console.log('[AssetPulse Seed] Creating immutable audit logs...');

  // Creation audit for active HDFC deposit
  await prisma.auditLog.create({
    data: {
      userId: demoUser.id,
      depositId: fdHealthy.id,
      action: 'CREATED',
      bankName: fdHealthy.bankName,
      accountNumber: fdHealthy.accountNumber,
      principalAmount: fdHealthy.principalAmount,
      snapshotData: JSON.stringify(fdHealthy),
      notes: 'Initial creation of fixed deposit.',
    },
  });

  // Closure audit for historic HDFC deposit
  await prisma.auditLog.create({
    data: {
      userId: demoUser.id,
      depositId: fdClosed.id,
      action: 'CLOSED',
      bankName: fdClosed.bankName,
      accountNumber: fdClosed.accountNumber,
      principalAmount: fdClosed.principalAmount,
      realizedInterest: 3488.22,
      penaltyAmount: 0.0,
      dispositionType: 'MATURED_REINVESTED',
      destinationAccount: 'HDFC-FD-984210',
      notes: 'Matured on schedule and reinvested into new 1-year deposit.',
      snapshotData: JSON.stringify(fdClosed),
      createdAt: dateOffset(-365),
    },
  });

  // Liquidation audit for Citibank premature withdrawal
  await prisma.auditLog.create({
    data: {
      userId: demoUser.id,
      depositId: fdLiquidated.id,
      action: 'LIQUIDATED',
      bankName: fdLiquidated.bankName,
      accountNumber: fdLiquidated.accountNumber,
      principalAmount: fdLiquidated.principalAmount,
      realizedInterest: 650.0,
      penaltyAmount: 200.0,
      dispositionType: 'PREMATURE_WITHDRAWAL',
      destinationAccount: 'Savings A/C ****4491',
      notes: 'Emergency liquidity withdrawal; 0.5% rate penalty deducted from interest.',
      snapshotData: JSON.stringify(fdLiquidated),
      createdAt: dateOffset(-65),
    },
  });

  // 5. Seed In-App Notifications
  console.log('[AssetPulse Seed] Creating notifications...');

  // Critical Notification: Matured Today
  await prisma.notification.create({
    data: {
      userId: demoUser.id,
      depositId: fdMaturedToday.id,
      type: 'MATURED_TODAY',
      severity: 'critical',
      title: 'Fixed Deposit Matured Today!',
      message: `Your deposit ${fdMaturedToday.accountNumber} with ${fdMaturedToday.bankName} for ₹${fdMaturedToday.maturityAmount.toLocaleString()} has matured today. Please take action.`,
      isRead: false,
      createdAt: dateOffset(0),
    },
  });

  // Warning Notification: 7-Day Window
  await prisma.notification.create({
    data: {
      userId: demoUser.id,
      depositId: fd5Days.id,
      type: 'MATURING_7_DAYS',
      severity: 'warning',
      title: 'Maturity Approaching in 5 Days',
      message: `Deposit ${fd5Days.accountNumber} at ${fd5Days.bankName} matures on ${fd5Days.maturityDate.toLocaleDateString()}. Payout: ₹${fd5Days.maturityAmount.toLocaleString()}.`,
      isRead: false,
      createdAt: dateOffset(-2),
    },
  });

  // Warning Notification: 14-Day Window
  await prisma.notification.create({
    data: {
      userId: demoUser.id,
      depositId: fd12Days.id,
      type: 'MATURING_14_DAYS',
      severity: 'warning',
      title: 'Deposit Maturing in 12 Days',
      message: `Deposit ${fd12Days.accountNumber} at ${fd12Days.bankName} will mature soon. Payout: ₹${fd12Days.maturityAmount.toLocaleString()}.`,
      isRead: false,
      createdAt: dateOffset(-3),
    },
  });

  // Info Notification: 30-Day Window (Already read)
  await prisma.notification.create({
    data: {
      userId: demoUser.id,
      depositId: fd26Days.id,
      type: 'MATURING_30_DAYS',
      severity: 'info',
      title: 'Maturity Alert: 26 Days Remaining',
      message: `Axis Bank deposit ${fd26Days.accountNumber} matures in 26 days.`,
      isRead: true,
      readAt: dateOffset(-1),
      createdAt: dateOffset(-4),
    },
  });

  // System Notification
  await prisma.notification.create({
    data: {
      userId: demoUser.id,
      depositId: null,
      type: 'SYSTEM',
      severity: 'info',
      title: 'Welcome to AssetPulse',
      message: 'Your personal fixed deposit portfolio tracker is ready. Monitor maturities, track compound yields, and maintain an immutable ledger.',
      isRead: true,
      readAt: dateOffset(-5),
      createdAt: dateOffset(-7),
    },
  });

  console.log('[AssetPulse Seed] Seeding completed successfully!');
  console.log(`[AssetPulse Seed] Summary:
  - Users: 1
  - Fixed Deposits: 7 (Active: 4, Matured: 1, Closed: 1, Liquidated: 1)
  - Audit Logs: 3 (CREATED, CLOSED, LIQUIDATED)
  - Notifications: 5 (Unread: 3, Read: 2)
  `);
}

main()
  .catch((e) => {
    console.error('[AssetPulse Seed] Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
