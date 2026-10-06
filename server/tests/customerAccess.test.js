import test from 'node:test';
import assert from 'node:assert/strict';
import { createCustomerAccessService } from '../utils/customerAccess.js';

test('customer access sends expiring one-time codes and issues a signed session', async () => {
  let deliveredCode = '';
  let time = 1000;
  const service = createCustomerAccessService({
    findCustomer: async (identifier) => identifier === 'alice@example.com' ? { id: 12, email: 'alice@example.com' } : null,
    deliverCode: async (_email, code) => { deliveredCode = code; },
    getSecret: () => 'customer-test-secret',
    now: () => time,
    makeCode: () => '123456',
  });

  await service.requestCode('alice@example.com', '127.0.0.1');
  assert.equal(deliveredCode, '123456');
  assert.equal(service.verifyCode('alice@example.com', '000000').ok, false);
  const verified = service.verifyCode('alice@example.com', '123456');
  assert.equal(verified.ok, true);
  assert.equal(service.customerIdFromSession(verified.token), 12);
  assert.equal(service.verifyCode('alice@example.com', '123456').ok, false);

  time += 60 * 1000 + 1;
  await service.requestCode('alice@example.com', '127.0.0.1');
  time += 10 * 60 * 1000 + 1;
  assert.equal(service.verifyCode('alice@example.com', '123456').ok, false);
});

test('unknown customer lookups do not disclose whether a profile exists', async () => {
  const service = createCustomerAccessService({
    findCustomer: async () => null,
    deliverCode: async () => assert.fail('No code should be delivered'),
    getSecret: () => 'customer-test-secret',
  });
  const result = await service.requestCode('+255712345678', '127.0.0.1');
  assert.equal(result.accepted, true);
  assert.match(result.message, /If a matching profile/);
});