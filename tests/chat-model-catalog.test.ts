import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CHAT_MODEL_CATALOG,
  getChatModelCatalogPlan,
  type ModelPricingSnapshot,
} from '../src/common/models/chat-model-catalog';

const expectedCatalog = [
  ['gpt-5.4', 'GPT-5.4', 4],
  ['gpt-5.5', 'GPT-5.5', 6],
  ['gpt-5.6-sol', 'GPT-5.6-Sol', 6],
  ['gpt-5.6-terra', 'GPT-5.6-Terra', 5],
  ['claude-opus-4-6', 'Claude-Opus-4-6', 6],
  ['claude-opus-4-7', 'Claude-Opus-4-7', 6],
  ['claude-opus-4-8', 'Claude-Opus-4-8', 7],
] as const;

test('catalog contains exactly the confirmed OpenAI and Anthropic models', () => {
  assert.deepEqual(
    CHAT_MODEL_CATALOG.map(({ modelId, modelName, coinCost }) => [modelId, modelName, coinCost]),
    expectedCatalog,
  );
  assert.ok(CHAT_MODEL_CATALOG.every((model) => model.category === 'CHAT' && model.isActive));
});

test('plan upserts canonical rows and deactivates stale or prefixed aliases only', () => {
  const current: ModelPricingSnapshot[] = [
    { modelId: 'gpt-5.4', modelName: 'Old name', category: 'CHAT', coinCost: 99, isActive: false },
    { modelId: 'gpt-4o', modelName: 'GPT-4o', category: 'CHAT', coinCost: 2, isActive: true },
    { modelId: 'openai/gpt-5.5', modelName: 'GPT-5.5 alias', category: 'CHAT', coinCost: 6, isActive: true },
    { modelId: 'claude-sonnet-4-6', modelName: 'Claude Sonnet 4.6', category: 'CHAT', coinCost: 4, isActive: true },
    { modelId: 'anthropic/claude-opus-4-8', modelName: 'Claude alias', category: 'CHAT', coinCost: 7, isActive: true },
    { modelId: 'gemini-3-pro-preview', modelName: 'Gemini-3-Pro', category: 'CHAT', coinCost: 3, isActive: true },
    { modelId: 'googleai/gemini-3-pro-preview', modelName: 'Gemini-3-Pro', category: 'CHAT', coinCost: 3, isActive: true },
    { modelId: 'gpt-image-2', modelName: 'GPT-image-2', category: 'IMAGE', coinCost: 1, isActive: true },
    { modelId: 'claude-video', modelName: 'Claude Video', category: 'VIDEO', coinCost: 9, isActive: true },
  ];

  const plan = getChatModelCatalogPlan(current);

  assert.deepEqual(plan.deactivateModelIds, [
    'anthropic/claude-opus-4-8',
    'claude-sonnet-4-6',
    'gpt-4o',
    'openai/gpt-5.5',
  ]);
  assert.deepEqual(plan.upserts.map((row) => row.modelId), expectedCatalog.map(([modelId]) => modelId));
  assert.equal(plan.upserts.find((row) => row.modelId === 'gpt-5.4')?.coinCost, 4);
  assert.ok(!plan.deactivateModelIds.some((id) => id.includes('gemini')));
  assert.ok(!plan.deactivateModelIds.includes('gpt-image-2'));
  assert.ok(!plan.deactivateModelIds.includes('claude-video'));
});

test('a synchronized snapshot produces no additional changes', () => {
  const synchronized: ModelPricingSnapshot[] = CHAT_MODEL_CATALOG.map((entry) => ({ ...entry }));
  const plan = getChatModelCatalogPlan(synchronized);

  assert.deepEqual(plan, { upserts: [], deactivateModelIds: [] });
});

test('every target model has a specific description', () => {
  for (const model of CHAT_MODEL_CATALOG) {
    assert.ok(model.description.length >= 20, `${model.modelId} description is too short`);
    assert.notEqual(model.description, 'Configured chat model');
    assert.notEqual(model.description, 'Leading chat model in the current configured set.');
  }
});
