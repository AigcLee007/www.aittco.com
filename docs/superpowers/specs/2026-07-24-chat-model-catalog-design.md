# Chat Model Catalog Design

## Goal

Update the text-model dropdown so that the existing Gemini group is unchanged, the OpenAI group contains exactly four current models, and the Anthropic group contains exactly three current models.

## Target Catalog

Gemini models and their current prices remain unchanged.

| Vendor | Model ID | Display name | Coin cost |
| --- | --- | --- | ---: |
| OpenAI | `gpt-5.4` | `GPT-5.4` | 4 |
| OpenAI | `gpt-5.5` | `GPT-5.5` | 6 |
| OpenAI | `gpt-5.6-sol` | `GPT-5.6-Sol` | 6 |
| OpenAI | `gpt-5.6-terra` | `GPT-5.6-Terra` | 5 |
| Anthropic | `claude-opus-4-6` | `Claude-Opus-4-6` | 6 |
| Anthropic | `claude-opus-4-7` | `Claude-Opus-4-7` | 6 |
| Anthropic | `claude-opus-4-8` | `Claude-Opus-4-8` | 7 |

## Data Ownership

The `ModelPricing` table remains the single source of truth for the dropdown. The existing `coin.getChatModels` procedure continues to return every active `CHAT` record, and the frontend continues to group records by model ID prefix.

The catalog update is implemented as an idempotent database synchronization operation:

1. Upsert the seven target OpenAI and Anthropic records with the exact names and prices above.
2. Set `isActive=true` on all seven target records.
3. Set `isActive=false` on every other active `CHAT` record whose normalized model ID belongs to OpenAI or Anthropic.
4. Do not update, deactivate, rename, reorder, or reprice any Gemini record.

Provider-prefixed forms such as `openai/gpt-...` and `anthropic/claude-...` count as OpenAI and Anthropic records. All such prefixed aliases are deactivated, including aliases that normalize to one of the target IDs. Only the seven canonical unprefixed target IDs remain active, which prevents duplicate dropdown entries. Gemini provider-prefixed records remain untouched.

Old records are retained rather than deleted so historical administration data remains inspectable and reactivation remains possible.

## Frontend Behavior

The dropdown remains database-driven. No second model allowlist is added to the React component.

The existing vendor grouping order is retained. Descriptions are added for the newly introduced GPT and Claude model IDs so the rows do not fall back to the generic description. Existing Gemini labels, descriptions, prices, ordering, and selection behavior are unchanged.

If the currently selected model is deactivated, the existing model-domain reassignment behavior selects an available configured model; no special migration of browser storage is added.

## Deployment

The default Prisma seed is updated so a new database starts with the target catalog instead of retired GPT and Claude entries. A separate idempotent synchronization script updates an existing database. Running the script more than once produces the same active catalog and prices.

The synchronization runs inside a transaction so upserts and deactivations cannot leave a partially updated catalog.

## Error Handling

Database errors abort the transaction and leave the existing catalog unchanged. The script exits non-zero and reports the failed operation without logging database credentials.

## Testing

Automated tests cover the catalog synchronization as a pure planning function before database execution:

- all seven target records are active with the exact requested prices;
- retired OpenAI and Anthropic chat records are deactivated;
- provider-prefixed retired records are deactivated;
- Gemini records and prices are not changed;
- image and video pricing records are not changed;
- a second synchronization produces no additional changes;
- frontend descriptions exist for all seven target models.

Verification also includes the focused tests, the full project test suite, and TypeScript type checking.
