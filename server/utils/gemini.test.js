import test from 'node:test';
import assert from 'node:assert/strict';
import { generateStaffAssistantReply, generateOperationsReport } from './gemini.js';

const snapshot = {
  generatedAt: '2026-09-06T00:00:00.000Z',
  customerSummary: { total: 42, vip: 8, inactive: 4, atRisk: 3 },
  risks: {
    unresolvedComplaints: 2,
    unpaidOrders: { count: 1, amount: 250000 },
    lowStock: [{ name: 'Chicken', quantity: 5, threshold: 20 }],
    delayedOrders: 1,
  },
  dailyBriefing: { openTasks: 4 },
  recentOrders: { last30Days: 55, revenue: 5400000 },
};

test('generateStaffAssistantReply falls back to offline analysis when Gemini is unavailable', async () => {
  const reply = await generateStaffAssistantReply(snapshot, 'Which customers need attention today?');
  assert.ok(reply);
  assert.match(reply.toLowerCase(), /vip|inactive|customer|attention|operations/i);
});

test('generateOperationsReport falls back to offline analysis when Gemini is unavailable', async () => {
  const report = await generateOperationsReport(snapshot);
  assert.ok(report);
  assert.match(report.toLowerCase(), /executive summary|priority issues|recommended actions/i);
});
