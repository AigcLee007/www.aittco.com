# Text Model Catalog Update Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the active text-model catalog to the confirmed Gemini, OpenAI, Claude, and xAI models while leaving image and video pricing untouched.

**Architecture:** Extend the existing shared catalog and transactional synchronizer so `ModelPricing` remains the single source of truth. Canonical unprefixed IDs are active; all other managed text CHAT rows, including provider-prefixed aliases, are deactivated. The chat dropdown and admin text presets consume the same target metadata.

**Tech Stack:** TypeScript, Node test runner via `tsx`, Prisma/PostgreSQL, Next.js/React.

---

### Task 1: Update the shared catalog contract with failing tests first

**Files:**
- Modify: `tests/chat-model-catalog.test.ts`
- Modify: `src/common/models/chat-model-catalog.ts`

- [ ] **Step 1: Replace the expected catalog fixture and add Gemini/xAI isolation cases**

Change `expectedCatalog` to exactly:

```ts
const expectedCatalog = [
  ['gemini-3.5-flash-preview', 'Gemini-3.5-Flash', 1],
  ['gemini-3.7-flash', 'Gemini-3.7-Flash', 2],
  ['gemini-3.1-pro-preview', 'Gemini-3.1-Pro', 3],
  ['gpt-5.5', 'GPT-5.5', 4],
  ['gpt-5.6-terra', 'GPT-5.6-Terra', 3],
  ['gpt-5.6-sol', 'GPT-5.6-Sol', 6],
  ['claude-opus-4-8', 'Claude-Opus-4-8', 6],
  ['claude-sonnet-5', 'Claude-Sonnet-5', 5],
  ['claude-opus-5', 'Claude-Opus-5', 7],
  ['grok-4.6', 'Grok-4.6', 3],
] as const;
```

Update the current-row fixture to include stale `gemini-3-flash-preview`, `googleai/gemini-3-flash-preview`, `gpt-5.4`, `claude-opus-4-6`, and `grok-4.1`. Assert all five are in `deactivateModelIds`; assert `gpt-image-2` and `claude-video` remain absent. Add a synchronized snapshot test from the new `CHAT_MODEL_CATALOG` and keep the description assertions.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `npm test -- tests/chat-model-catalog.test.ts`

Expected: FAIL because the current seven-entry catalog does not equal the new ten-entry fixture and the stale-row expectations are unmet.

- [ ] **Step 3: Implement the ten-entry shared catalog and managed-provider detection**

In `src/common/models/chat-model-catalog.ts`:

1. Change `ChatModelCatalogEntry.vendor` to `'googleai' | 'openai' | 'anthropic' | 'xai'`.
2. Replace `CHAT_MODEL_CATALOG` with the ten exact entries and prices from Step 1, each with a specific description.
3. Update `isManagedChatModelId` to treat `gemini-`, `googleai/`, `gpt-`, `openai/`, `claude-`, `anthropic/`, `grok-`, and `xai/` as managed text IDs.
4. Keep `category === 'CHAT'` as a required filter before deactivation, so IMAGE and VIDEO rows never change.

The planner must compare exact canonical IDs, so only the ten unprefixed IDs remain active; `googleai/<id>`, `openai/<id>`, `anthropic/<id>`, and `xai/<id>` aliases are deactivated unless they are not active.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `npm test -- tests/chat-model-catalog.test.ts`

Expected: all catalog tests PASS.

- [ ] **Step 5: Commit the catalog contract**

```bash
git add src/common/models/chat-model-catalog.ts tests/chat-model-catalog.test.ts
git commit -m "feat: update active text model catalog"
```

### Task 2: Align seed, admin presets, and dropdown metadata

**Files:**
- Modify: `src/server/prisma/seed.ts`
- Modify: `src/apps/admin/PricingSection.tsx`
- Modify: `src/apps/chat/components/layout-bar/useLLMDropdown.tsx`

- [ ] **Step 1: Update the admin text presets**

Replace the `chatPresets` array with the ten catalog entries grouped as `Gemini`, `OpenAI`, `Anthropic`, and `xAI`, using the exact model IDs, display labels, and coin costs from Task 1. Do not change `videoPresets` or `imagePresets`.

- [ ] **Step 2: Keep fresh database seed data sourced from the shared catalog**

Leave the existing Gemini/image seed literals unchanged except for removing the old Gemini CHAT literals, then spread the shared catalog entries into `modelPricingData` as already done for the OpenAI/Claude catalog. The seed must not add provider aliases for the new catalog.

- [ ] **Step 3: Reuse shared descriptions in the dropdown**

Keep the existing Gemini-specific legacy descriptions only for models still present elsewhere if needed, spread `CHAT_MODEL_DESCRIPTIONS` into `getConfiguredModelDescription`, and remove stale GPT/Claude descriptions that refer to retired catalog IDs. No frontend allowlist or filtering is added.

- [ ] **Step 4: Run static checks**

Run: `npm run typecheck`

Expected: exit code 0.

Run: `npm test -- tests/chat-model-catalog.test.ts`

Expected: all catalog tests PASS.

- [ ] **Step 5: Commit UI and seed alignment**

```bash
git add src/server/prisma/seed.ts src/apps/admin/PricingSection.tsx src/apps/chat/components/layout-bar/useLLMDropdown.tsx
git commit -m "feat: align text model controls with catalog"
```

### Task 3: Synchronize and verify the database

**Files:**
- Verify: `src/server/services/chat-model-catalog.service.ts`
- Verify: `scripts/sync-chat-model-catalog.ts`

- [ ] **Step 1: Run the synchronization against the configured database**

Run: `npm run db:sync-chat-models`

Expected: exit code 0; ten target records are upserted or corrected and stale managed CHAT records are deactivated. IMAGE and VIDEO records remain untouched.

- [ ] **Step 2: Run the synchronizer a second time**

Run: `npm run db:sync-chat-models`

Expected: `更新 0 条，停用 0 条`.

- [ ] **Step 3: Run the complete verification suite**

Run: `npm test`

Expected: all tests PASS.

Run: `npm run typecheck`

Expected: exit code 0.

Run: `npm run build`

Expected: production build exits 0; on low-memory Windows hosts use `experimental.cpus: 1` only as a temporary diagnostic override and remove it after verification.

- [ ] **Step 4: Inspect repository state**

Run: `git diff --check; git status --short`

Expected: no whitespace errors and only intentional committed changes remain.

- [ ] **Step 5: Commit the implementation plan**

```bash
git add docs/superpowers/plans/2026-08-29-text-model-catalog-update.md
git commit -m "docs: plan text model catalog update"
```
