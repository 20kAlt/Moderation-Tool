import test from 'node:test';
import assert from 'node:assert/strict';

import { answerBotQuestion, createBotKnowledge } from '../src/utils/botDmResponse.js';

test('bot knowledge includes credits, documented features, and available commands', () => {
  const knowledge = createBotKnowledge(
    { owner: '20k' },
    [{ data: { name: 'ticket', description: 'Create and manage support tickets.' }, category: 'Ticket' }],
  );

  assert.match(knowledge, /owned by 20k/);
  assert.match(knowledge, /do not name individual developers/);
  assert.match(knowledge, /verification/);
  assert.match(knowledge, /\/ticket \(Ticket\): Create and manage support tickets/);
});

test('sends user questions and bot knowledge to the configured OpenAI Responses API', async () => {
  let request;
  const answer = await answerBotQuestion({
    question: 'Who made this bot?',
    knowledge: 'The bot is owned by 20k.',
    apiKey: 'test-key',
    model: 'test-model',
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return {
        ok: true,
        json: async () => ({
          output: [{ content: [{ type: 'output_text', text: 'The bot is owned by 20k.' }] }],
        }),
      };
    },
  });

  assert.equal(answer, 'The bot is owned by 20k.');
  assert.equal(request.url, 'https://api.openai.com/v1/responses');
  assert.equal(request.options.headers.Authorization, 'Bearer test-key');
  assert.equal(request.body.model, 'test-model');
  assert.equal(request.body.input, 'Who made this bot?');
  assert.match(request.body.instructions, /Never invent capabilities/);
});

test('does not call OpenAI when the API key is missing', async () => {
  await assert.rejects(
    answerBotQuestion({ question: 'What features do you have?', knowledge: '', apiKey: '' }),
    { code: 'AI_NOT_CONFIGURED' },
  );
});

test('blocks obvious credentials before they can be sent to OpenAI', async () => {
  let called = false;

  await assert.rejects(
    answerBotQuestion({
      question: 'My API key is sk-proj-123456789012345678901234567890',
      knowledge: '',
      apiKey: 'test-key',
      fetchImpl: async () => {
        called = true;
        return { ok: true, json: async () => ({}) };
      },
    }),
    { code: 'AI_SENSITIVE_INPUT' },
  );

  assert.equal(called, false);
});

test('reports provider errors without returning an invented answer', async () => {
  await assert.rejects(
    answerBotQuestion({
      question: 'What features do you have?',
      knowledge: '',
      apiKey: 'test-key',
      fetchImpl: async () => ({ ok: false, status: 429 }),
    }),
    { code: 'AI_REQUEST_FAILED' },
  );
});
