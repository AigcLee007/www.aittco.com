import assert from 'node:assert/strict';
import test from 'node:test';

import { createOpenAIResponsesEventParser } from '../src/modules/aix/server/dispatch/chatGenerate/parsers/openai.responses.parser';

test('ignores codex rate limit events emitted by the relay', () => {
  const parser = createOpenAIResponsesEventParser();
  const rateLimitEvent = JSON.stringify({
    type: 'codex.rate_limits',
    plan_type: 'team',
    rate_limits: { allowed: true, limit_reached: false },
  });

  assert.doesNotThrow(() => parser({} as any, rateLimitEvent));
});

test('ignores codex response metadata events emitted by the relay', () => {
  const parser = createOpenAIResponsesEventParser();
  const metadataEvent = JSON.stringify({
    type: 'codex.response.metadata',
    headers: { 'x-models-etag': 'W/"relay-models"' },
  });

  assert.doesNotThrow(() => parser({} as any, metadataEvent));
});

test('accepts content part events without item_id from the relay', () => {
  const parser = createOpenAIResponsesEventParser();
  const contentPartEvent = JSON.stringify({
    type: 'response.content_part.added',
    output_index: 1,
    content_index: 0,
    part: { type: 'output_text', text: '' },
  });

  assert.doesNotThrow(() => parser({} as any, contentPartEvent));
});
