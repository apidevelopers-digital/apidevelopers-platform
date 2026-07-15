import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createConversationSession,
  createConversationTurn,
} from '../src/index.js';

test('creates a conversation session', () => {
  const session = createConversationSession({
    tenantId: 'tenant-1',
    sessionId: 'session-1',
    correlationId: 'corr-1',
    channel: 'whatsapp',
  });

  assert.equal(session.tenantId, 'tenant-1');
  assert.equal(session.status, 'active');
  assert.equal(session.channel, 'whatsapp');
  assert.equal(Object.isFrozen(session), true);
});

test('creates a conversation turn', () => {
  const turn = createConversationTurn({
    tenantId: 'tenant-1',
    sessionId: 'session-1',
    turnId: 'turn-1',
    correlationId: 'corr-1',
    role: 'user',
    content: 'Ola',
  });

  assert.equal(turn.role, 'user');
  assert.equal(turn.content, 'Ola');
  assert.equal(Object.isFrozen(turn), true);
});

test('rejects missing session context', () => {
  assert.throws(
    () => createConversationSession({ tenantId: 'tenant-1' }),
    TypeError,
  );
});

test('rejects invalid role', () => {
  assert.throws(
    () => createConversationTurn({
      tenantId: 'tenant-1',
      sessionId: 'session-1',
      turnId: 'turn-1',
      correlationId: 'corr-1',
      role: 'hacker',
      content: 'test',
    }),
    TypeError,
  );
});

test('rejects empty content', () => {
  assert.throws(
    () => createConversationTurn({
      tenantId: 'tenant-1',
      sessionId: 'session-1',
      turnId: 'turn-1',
      correlationId: 'corr-1',
      role: 'user',
      content: '   ',
    }),
    TypeError,
  );
});
