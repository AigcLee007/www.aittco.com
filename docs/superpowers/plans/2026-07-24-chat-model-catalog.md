# Chat Model Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace retired OpenAI and Anthropic text-model dropdown entries with the seven confirmed models and prices while leaving every Gemini entry unchanged.

**Architecture:** Keep `ModelPricing` as the runtime source of truth. A shared, browser-safe catalog module owns the seven canonical records, their descriptions, provider detection, and a pure change planner; a server service applies that plan in one Prisma transaction, while seed data, CLI synchronization, and the dropdown reuse the shared catalog.

**Tech Stack:** TypeScript 5.9, Node test runner through `tsx`, Prisma 5/PostgreSQL, Next.js 15, React 18.

---

## File Structure

- Create `src/common/models/chat-model-catalog.ts`: seven canonical entries, shared descriptions, managed-provider detection, and pure idempotent change planning.
- Create `tests/chat-model-catalog.test.ts`: catalog contract, isolation, alias deactivation, idempotence, and description coverage.
- Create `src/server/services/chat-model-catalog.service.ts`: read current pricing rows and apply planned writes in one Prisma transaction.
- Create `scripts/sync-chat-model-catalog.ts`: executable database synchronization entry point with failure exit status and disconnect cleanup.
- Modify `package.json`: expose `db:sync-chat-models`.
- Modify `src/server/prisma/seed.ts`: replace retired GPT/Claude seed rows with the shared seven-entry catalog; preserve all Gemini/image rows and the existing empty-table guard.
- Modify `update_pricing.ts`: delegate legacy invocation to the canonical synchronizer so it cannot reactivate retired rows.
- Modify `update_pricing_v2.ts`: delegate legacy invocation to the canonical synchronizer so it cannot reactivate prefixed Claude aliases.
- Modify `src/apps/chat/components/layout-bar/useLLMDropdown.tsx`: consume shared descriptions for the seven new model IDs without adding a frontend allowlist.

### Task 1: Specify the Catalog and Synchronization Diff

**Files:**
- Create: `tests/chat-model-catalog.test.ts`
- Create: `src/common/models/chat-model-catalog.ts`

- [ ] **Step 1: Write the failing catalog tests**

Create `tests/chat-model-catalog.test.ts` with complete fixtures for canonical, stale, prefixed, Gemini, image, and video records:

```ts
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
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `npm test -- tests/chat-model-catalog.test.ts`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `src/common/models/chat-model-catalog`.

- [ ] **Step 3: Implement the browser-safe shared catalog and pure planner**

Create `src/common/models/chat-model-catalog.ts`:

```ts
export type ModelPricingCategory = 'CHAT' | 'IMAGE' | 'VIDEO';

export type ModelPricingSnapshot = {
  modelId: string;
  modelName: string;
  category: ModelPricingCategory;
  coinCost: number;
  isActive: boolean;
};

export type ChatModelCatalogEntry = ModelPricingSnapshot & {
  vendor: 'openai' | 'anthropic';
  description: string;
};

export const CHAT_MODEL_CATALOG: readonly ChatModelCatalogEntry[] = [
  { modelId: 'gpt-5.4', modelName: 'GPT-5.4', vendor: 'openai', category: 'CHAT', coinCost: 4, isActive: true, description: 'GPT-5.4：新一代通用旗舰模型，代码、推理、写作与工具调用能力全面。' },
  { modelId: 'gpt-5.5', modelName: 'GPT-5.5', vendor: 'openai', category: 'CHAT', coinCost: 6, isActive: true, description: 'GPT-5.5：增强复杂推理与指令遵循能力，适合高要求分析和生产任务。' },
  { modelId: 'gpt-5.6-sol', modelName: 'GPT-5.6-Sol', vendor: 'openai', category: 'CHAT', coinCost: 6, isActive: true, description: 'GPT-5.6 Sol：面向深度推理和软件工程任务优化，强调准确性与完整性。' },
  { modelId: 'gpt-5.6-terra', modelName: 'GPT-5.6-Terra', vendor: 'openai', category: 'CHAT', coinCost: 5, isActive: true, description: 'GPT-5.6 Terra：兼顾响应效率与综合质量，适合日常开发和通用工作流。' },
  { modelId: 'claude-opus-4-6', modelName: 'Claude-Opus-4-6', vendor: 'anthropic', category: 'CHAT', coinCost: 6, isActive: true, description: 'Claude Opus 4.6：高端旗舰模型，擅长深度推理、长文写作与严谨表达。' },
  { modelId: 'claude-opus-4-7', modelName: 'Claude-Opus-4-7', vendor: 'anthropic', category: 'CHAT', coinCost: 6, isActive: true, description: 'Claude Opus 4.7：强化长上下文理解和复杂分析，适合研究与专业写作。' },
  { modelId: 'claude-opus-4-8', modelName: 'Claude-Opus-4-8', vendor: 'anthropic', category: 'CHAT', coinCost: 7, isActive: true, description: 'Claude Opus 4.8：面向最高质量推理与内容生成，适合高难度综合任务。' },
] as const;

const catalogById = new Map(CHAT_MODEL_CATALOG.map((entry) => [entry.modelId, entry]));

export const CHAT_MODEL_DESCRIPTIONS: Readonly<Record<string, string>> = Object.fromEntries(
  CHAT_MODEL_CATALOG.map(({ modelId, description }) => [modelId, description]),
);

function isManagedChatModelId(modelId: string): boolean {
  const normalized = modelId.trim().replace(/^models\//i, '').toLowerCase();
  return normalized.startsWith('gpt-')
    || normalized.startsWith('claude-')
    || normalized.startsWith('openai/')
    || normalized.startsWith('anthropic/');
}

function needsCanonicalUpsert(current: ModelPricingSnapshot | undefined, target: ChatModelCatalogEntry): boolean {
  return !current
    || current.modelName !== target.modelName
    || current.category !== target.category
    || current.coinCost !== target.coinCost
    || current.isActive !== target.isActive;
}

export function getChatModelCatalogPlan(currentRows: readonly ModelPricingSnapshot[]): {
  upserts: ChatModelCatalogEntry[];
  deactivateModelIds: string[];
} {
  const currentByExactId = new Map(currentRows.map((row) => [row.modelId, row]));
  const upserts = CHAT_MODEL_CATALOG
    .filter((target) => needsCanonicalUpsert(currentByExactId.get(target.modelId), target))
    .map((target) => ({ ...target }));
  const deactivateModelIds = currentRows
    .filter((row) => row.category === 'CHAT'
      && row.isActive
      && isManagedChatModelId(row.modelId)
      && !catalogById.has(row.modelId))
    .map((row) => row.modelId)
    .sort();

  return { upserts, deactivateModelIds };
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `npm test -- tests/chat-model-catalog.test.ts`

Expected: 4 tests PASS, 0 FAIL.

- [ ] **Step 5: Commit the pure catalog contract**

```bash
git add tests/chat-model-catalog.test.ts src/common/models/chat-model-catalog.ts
git commit -m "feat: define canonical chat model catalog"
```

### Task 2: Apply the Catalog Transactionally

**Files:**
- Create: `src/server/services/chat-model-catalog.service.ts`
- Create: `scripts/sync-chat-model-catalog.ts`
- Modify: `package.json`

- [ ] **Step 1: Add a compile-time RED import to the service consumer**

Create `scripts/sync-chat-model-catalog.ts` first:

```ts
import { prismaDb } from '../src/server/prisma/prismaDb';
import { syncChatModelCatalog } from '../src/server/services/chat-model-catalog.service';

async function main(): Promise<void> {
  const result = await syncChatModelCatalog();
  console.log(`文本模型目录同步完成：更新 ${result.upserted} 条，停用 ${result.deactivated} 条。`);
}

main()
  .catch((error: unknown) => {
    console.error('文本模型目录同步失败:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prismaDb.$disconnect();
  });
```

- [ ] **Step 2: Run type checking and verify RED**

Run: `npm run typecheck`

Expected: FAIL with `Cannot find module '../src/server/services/chat-model-catalog.service'`.

- [ ] **Step 3: Implement the transactional service**

Create `src/server/services/chat-model-catalog.service.ts`:

```ts
import { getChatModelCatalogPlan } from '../../common/models/chat-model-catalog';
import { prismaDb } from '../prisma/prismaDb';

export async function syncChatModelCatalog(): Promise<{ upserted: number; deactivated: number }> {
  return prismaDb.$transaction(async (tx) => {
    const currentRows = await tx.modelPricing.findMany({
      select: { modelId: true, modelName: true, category: true, coinCost: true, isActive: true },
    });
    const plan = getChatModelCatalogPlan(currentRows);

    if (!plan.upserts.length && !plan.deactivateModelIds.length)
      return { upserted: 0, deactivated: 0 };

    for (const { vendor: _vendor, description: _description, ...pricing } of plan.upserts) {
      await tx.modelPricing.upsert({
        where: { modelId: pricing.modelId },
        update: pricing,
        create: pricing,
      });
    }

    const deactivated = plan.deactivateModelIds.length
      ? await tx.modelPricing.updateMany({
        where: { modelId: { in: plan.deactivateModelIds }, category: 'CHAT', isActive: true },
        data: { isActive: false },
      })
      : { count: 0 };

    return { upserted: plan.upserts.length, deactivated: deactivated.count };
  });
}
```

- [ ] **Step 4: Expose the CLI command**

Add this entry beside the other `db:*` scripts in `package.json`:

```json
"db:sync-chat-models": "tsx scripts/sync-chat-model-catalog.ts"
```

- [ ] **Step 5: Verify types and the focused tests**

Run: `npm run typecheck`

Expected: PASS with exit code 0.

Run: `npm test -- tests/chat-model-catalog.test.ts`

Expected: 4 tests PASS, 0 FAIL.

- [ ] **Step 6: Commit the database synchronizer**

```bash
git add src/server/services/chat-model-catalog.service.ts scripts/sync-chat-model-catalog.ts package.json
git commit -m "feat: synchronize chat model pricing catalog"
```

### Task 3: Align Fresh Seeds and Retire Stale Update Scripts

**Files:**
- Modify: `src/server/prisma/seed.ts`
- Modify: `update_pricing.ts`
- Modify: `update_pricing_v2.ts`

- [ ] **Step 1: Add the shared catalog to the seed**

Import the catalog in `src/server/prisma/seed.ts`:

```ts
import { CHAT_MODEL_CATALOG } from '../../common/models/chat-model-catalog';
```

Remove the existing Claude/GPT `CHAT` literals, leave all Gemini and non-chat literals byte-for-byte unchanged, and insert:

```ts
    ...CHAT_MODEL_CATALOG.map(({ vendor: _vendor, description: _description, ...pricing }) => pricing),
```

Keep the existing `existingModelPricingCount === 0` guard. The explicit migration path for populated databases remains `npm run db:sync-chat-models`.

- [ ] **Step 2: Make both legacy pricing entry points use the canonical service**

Replace the contents of both `update_pricing.ts` and `update_pricing_v2.ts` with:

```ts
import { prismaDb } from './src/server/prisma/prismaDb';
import { syncChatModelCatalog } from './src/server/services/chat-model-catalog.service';

syncChatModelCatalog()
  .then(({ upserted, deactivated }) => {
    console.log(`文本模型目录同步完成：更新 ${upserted} 条，停用 ${deactivated} 条。`);
  })
  .catch((error: unknown) => {
    console.error('文本模型目录同步失败:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prismaDb.$disconnect();
  });
```

- [ ] **Step 3: Verify stale catalog literals are gone**

Run: `rg -n "gpt-4o|gpt-4-turbo|gpt-5\.2-thinking|claude-3-5-sonnet|anthropic/claude-opus-4-6" src/server/prisma/seed.ts update_pricing.ts update_pricing_v2.ts`

Expected: no matches and exit code 1 from `rg`.

- [ ] **Step 4: Verify seed and legacy scripts type-check**

Run: `npm run typecheck`

Expected: PASS with exit code 0.

- [ ] **Step 5: Commit seed and legacy-script alignment**

```bash
git add src/server/prisma/seed.ts update_pricing.ts update_pricing_v2.ts
git commit -m "chore: align pricing seed with chat catalog"
```

### Task 4: Show Specific Descriptions in the Dropdown

**Files:**
- Modify: `src/apps/chat/components/layout-bar/useLLMDropdown.tsx`
- Test: `tests/chat-model-catalog.test.ts`

- [ ] **Step 1: Import shared descriptions**

Add beside the other `~/common` imports:

```ts
import { CHAT_MODEL_DESCRIPTIONS } from '~/common/models/chat-model-catalog';
```

- [ ] **Step 2: Replace only the managed model description literals**

In `getConfiguredModelDescription`, keep all existing Gemini and Grok entries and replace stale GPT/Claude entries with the shared map:

```ts
  const descriptions: Record<string, string> = {
    'gemini-3-flash-preview': 'Gemini 3 Flash：主打速度与低延迟，适合高频日常对话与轻量任务。',
    'gemini-3-pro-preview': 'Gemini 3 Pro：推理与代码能力更强，适合复杂分析与长上下文任务。',
    'gemini-3.1-pro-preview': 'Gemini 3.1 Pro：在复杂推理与稳定性上进一步增强，适合高要求生产场景。',
    ...CHAT_MODEL_DESCRIPTIONS,
    'grok-4.1': 'Grok 4.1：通用对话与推理能力突出，适合实时问答与多领域分析。',
  };
```

Do not add filtering or an allowlist in this component; active `ModelPricing` rows continue to determine dropdown membership.

- [ ] **Step 3: Run focused tests and type checking**

Run: `npm test -- tests/chat-model-catalog.test.ts`

Expected: 4 tests PASS, 0 FAIL.

Run: `npm run typecheck`

Expected: PASS with exit code 0.

- [ ] **Step 4: Commit dropdown metadata changes**

```bash
git add src/apps/chat/components/layout-bar/useLLMDropdown.tsx
git commit -m "feat: describe current chat models in dropdown"
```

### Task 5: Synchronize the Current Database and Verify End to End

**Files:**
- Verify only: `src/common/models/chat-model-catalog.ts`
- Verify only: `src/server/services/chat-model-catalog.service.ts`
- Verify only: `src/server/prisma/seed.ts`
- Verify only: `src/apps/chat/components/layout-bar/useLLMDropdown.tsx`

- [ ] **Step 1: Run the complete automated test suite**

Run: `npm test`

Expected: all tests PASS, including the four chat catalog tests.

- [ ] **Step 2: Run final static verification**

Run: `npm run typecheck`

Expected: PASS with exit code 0.

- [ ] **Step 3: Apply the idempotent synchronization to the configured database**

Run: `npm run db:sync-chat-models`

Expected: exit code 0 and `文本模型目录同步完成：更新 N 条，停用 N 条。`; no database URL or credential is printed.

- [ ] **Step 4: Prove the database operation is idempotent**

Run: `npm run db:sync-chat-models`

Expected: exit code 0 and `文本模型目录同步完成：更新 0 条，停用 0 条。`.

- [ ] **Step 5: Build the application**

Run: `npm run build`

Expected: Next.js production build completes with exit code 0.

- [ ] **Step 6: Inspect the final diff and repository state**

Run: `git diff --check`

Expected: no whitespace errors.

Run: `git status --short`

Expected: only intentional task files appear; commit any remaining verification-safe changes with:

```bash
git add package.json scripts/sync-chat-model-catalog.ts src/common/models/chat-model-catalog.ts src/server/services/chat-model-catalog.service.ts src/server/prisma/seed.ts src/apps/chat/components/layout-bar/useLLMDropdown.tsx tests/chat-model-catalog.test.ts update_pricing.ts update_pricing_v2.ts
git commit -m "feat: update text model dropdown catalog"
```
