# Fixed Text Model Host Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Force the ten catalogued text models to send requests to `https://api.aittco.com` while leaving image, video, and non-catalogued model routing unchanged.

**Architecture:** Add one shared fixed-host constant and model-ID predicate to the chat catalog module. Apply the predicate at the Gemini, OpenAI/xAI, and Anthropic request builders so only actual chat requests for the ten canonical IDs override user/environment hosts.

**Tech Stack:** TypeScript, Next.js, Node test runner, existing LLM access modules.

---

### Task 1: Add fixed-host catalog helpers and tests

**Files:**
- Modify: `src/common/models/chat-model-catalog.ts`
- Test: `tests/chat-model-catalog.test.ts`

- [ ] Add `CHAT_MODEL_FIXED_API_HOST = 'https://api.aittco.com'` and an exported predicate that normalizes optional `googleai/`, `openai/`, `anthropic/`, or `xai/` prefixes before matching the ten exact catalog IDs.
- [ ] Add tests for all ten canonical IDs, prefixed IDs, and a non-target/image ID.
- [ ] Run `npm test -- tests/chat-model-catalog.test.ts`; expected new tests fail before the helper exists and pass after implementation.

### Task 2: Force the host at provider request builders

**Files:**
- Modify: `src/modules/llms/server/gemini/gemini.access.ts`
- Modify: `src/modules/llms/server/openai/openai.access.ts`
- Modify: `src/modules/llms/server/anthropic/anthropic.access.ts`
- Modify: `src/modules/aix/server/dispatch/chatGenerate/chatGenerate.dispatch.ts`

- [ ] For target Gemini and OpenAI/xAI model IDs, choose the shared fixed host before `llmsFixupHost`; preserve each existing protocol and path.
- [ ] Add an explicit Anthropic routing model option, pass `model.id` from chat dispatch, and use the fixed host only for target Claude chat requests.
- [ ] Keep model listing, Skills/files requests, image/video routes, and non-target models on existing host resolution.
- [ ] Add request-builder tests or pure helper assertions covering override resistance and protocol paths.

### Task 3: Verify and commit

**Files:**
- No additional files.

- [ ] Run `npm test`, `npm run typecheck`, and `git diff --check`.
- [ ] Review the diff for image/video route changes and confirm none are present.
- [ ] Commit with `feat: fix text model api host`.
