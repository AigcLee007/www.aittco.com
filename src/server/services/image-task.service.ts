import { randomUUID } from 'node:crypto';
import { prismaDb } from '../prisma/prismaDb';

export type LocalImageTaskStatus = 'PROCESSING' | 'SUCCESS' | 'FAILED';

export type LocalImageTask = {
  id: string;
  userId: string;
  provider: string;
  modelId: string;
  pricingModelId: string | null;
  status: LocalImageTaskStatus;
  mode: string | null;
  requestPayload: any;
  responsePayload: any;
  resultUrls: string[];
  errorText: string | null;
  upstreamTaskId: string | null;
  createdAt: Date;
  updatedAt: Date;
  finishedAt: Date | null;
};

type CreateLocalImageTaskParams = {
  userId: string;
  provider: string;
  modelId: string;
  pricingModelId?: string | null;
  mode?: string | null;
  requestPayload?: any;
  upstreamTaskId?: string | null;
};

const LOCAL_IMAGE_TASK_PREFIX = 'imgtask_';
let imageTaskTableReady = false;

export function createLocalImageTaskId(): string {
  return `${LOCAL_IMAGE_TASK_PREFIX}${randomUUID()}`;
}

export function isLocalImageTaskId(taskId?: string | null): boolean {
  return String(taskId || '').startsWith(LOCAL_IMAGE_TASK_PREFIX);
}

async function ensureImageTaskTable(): Promise<void> {
  if (imageTaskTableReady)
    return;

  await prismaDb.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ImageTask" (
      id TEXT PRIMARY KEY,
      "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
      provider TEXT NOT NULL,
      "modelId" TEXT NOT NULL,
      "pricingModelId" TEXT,
      status TEXT NOT NULL CHECK (status IN ('PROCESSING','SUCCESS','FAILED')),
      mode TEXT,
      "requestPayload" JSONB,
      "responsePayload" JSONB,
      "resultUrls" JSONB NOT NULL DEFAULT '[]'::jsonb,
      "errorText" TEXT,
      "upstreamTaskId" TEXT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "finishedAt" TIMESTAMPTZ
    );
  `);
  await prismaDb.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "ImageTask_user_created_idx" ON "ImageTask"("userId", "createdAt" DESC);');
  await prismaDb.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "ImageTask_status_created_idx" ON "ImageTask"(status, "createdAt");');
  await prismaDb.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS "ImageTask_provider_status_idx" ON "ImageTask"(provider, status);');

  imageTaskTableReady = true;
}

function normalizeResultUrls(value: any): string[] {
  if (!Array.isArray(value))
    return [];
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean);
}

function normalizeTaskRow(row: any): LocalImageTask {
  return {
    id: String(row.id),
    userId: String(row.userId),
    provider: String(row.provider),
    modelId: String(row.modelId),
    pricingModelId: row.pricingModelId ? String(row.pricingModelId) : null,
    status: String(row.status || 'PROCESSING') as LocalImageTaskStatus,
    mode: row.mode ? String(row.mode) : null,
    requestPayload: row.requestPayload ?? null,
    responsePayload: row.responsePayload ?? null,
    resultUrls: normalizeResultUrls(row.resultUrls),
    errorText: row.errorText ? String(row.errorText) : null,
    upstreamTaskId: row.upstreamTaskId ? String(row.upstreamTaskId) : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    finishedAt: row.finishedAt ?? null,
  };
}

export async function createLocalImageTask(params: CreateLocalImageTaskParams): Promise<LocalImageTask> {
  await ensureImageTaskTable();

  const id = createLocalImageTaskId();
  const requestPayloadJson = JSON.stringify(params.requestPayload ?? null);
  const emptyResultJson = JSON.stringify([]);

  await prismaDb.$executeRaw`
    INSERT INTO "ImageTask" (
      id, "userId", provider, "modelId", "pricingModelId", status, mode, "requestPayload",
      "responsePayload", "resultUrls", "errorText", "upstreamTaskId", "createdAt", "updatedAt", "finishedAt"
    )
    VALUES (
      ${id}, ${params.userId}, ${params.provider}, ${params.modelId}, ${params.pricingModelId ?? null},
      'PROCESSING', ${params.mode ?? null}, CAST(${requestPayloadJson} AS jsonb),
      NULL, CAST(${emptyResultJson} AS jsonb), NULL, ${params.upstreamTaskId ?? null}, NOW(), NOW(), NULL
    )
  `;

  const task = await getLocalImageTask(id);
  if (!task)
    throw new Error('本地图片任务创建失败');
  return task;
}

export async function getLocalImageTask(taskId: string): Promise<LocalImageTask | null> {
  await ensureImageTaskTable();

  const rows = await prismaDb.$queryRaw<any[]>`
    SELECT
      id, "userId", provider, "modelId", "pricingModelId", status, mode,
      "requestPayload", "responsePayload", "resultUrls", "errorText", "upstreamTaskId",
      "createdAt", "updatedAt", "finishedAt"
    FROM "ImageTask"
    WHERE id = ${taskId}
    LIMIT 1
  `;

  return rows[0] ? normalizeTaskRow(rows[0]) : null;
}

export async function markLocalImageTaskUpstream(taskId: string, upstreamTaskId: string, responsePayload?: any): Promise<void> {
  await ensureImageTaskTable();
  const responsePayloadJson = JSON.stringify(responsePayload ?? null);
  await prismaDb.$executeRaw`
    UPDATE "ImageTask"
    SET "upstreamTaskId" = ${upstreamTaskId},
        "responsePayload" = CASE
          WHEN ${responsePayload === undefined}
            THEN "responsePayload"
          ELSE CAST(${responsePayloadJson} AS jsonb)
        END,
        "updatedAt" = NOW()
    WHERE id = ${taskId}
  `;
}

export async function completeLocalImageTask(taskId: string, resultUrls: string[], responsePayload?: any): Promise<void> {
  await ensureImageTaskTable();
  const normalizedUrls = normalizeResultUrls(resultUrls);
  const resultUrlsJson = JSON.stringify(normalizedUrls);
  const responsePayloadJson = JSON.stringify(responsePayload ?? null);
  await prismaDb.$executeRaw`
    UPDATE "ImageTask"
    SET status = 'SUCCESS',
        "resultUrls" = CAST(${resultUrlsJson} AS jsonb),
        "responsePayload" = CAST(${responsePayloadJson} AS jsonb),
        "errorText" = NULL,
        "finishedAt" = NOW(),
        "updatedAt" = NOW()
    WHERE id = ${taskId}
  `;
}

export async function failLocalImageTask(taskId: string, errorText: string, responsePayload?: any): Promise<void> {
  await ensureImageTaskTable();
  const responsePayloadJson = JSON.stringify(responsePayload ?? null);
  await prismaDb.$executeRaw`
    UPDATE "ImageTask"
    SET status = 'FAILED',
        "errorText" = ${errorText || '任务失败'},
        "responsePayload" = CAST(${responsePayloadJson} AS jsonb),
        "finishedAt" = NOW(),
        "updatedAt" = NOW()
    WHERE id = ${taskId}
  `;
}

export function extractImageUrlsFromPayload(data: any): string[] {
  const urls: string[] = [];
  const addUrl = (value: any) => {
    if (typeof value !== 'string')
      return;
    const trimmed = value.trim();
    if (trimmed)
      urls.push(trimmed);
  };

  const addOpenAIItem = (item: any) => {
    if (!item || typeof item !== 'object')
      return;
    if (typeof item.url === 'string')
      addUrl(item.url);
    if (typeof item.b64_json === 'string' && item.b64_json)
      addUrl(`data:image/png;base64,${item.b64_json}`);
  };

  if (Array.isArray(data?.results))
    data.results.forEach((item: any) => addUrl(item?.url || item?.imageUrl || item?.image_url || item?.image));
  if (Array.isArray(data?.data))
    data.data.forEach(addOpenAIItem);
  if (Array.isArray(data?.data?.data))
    data.data.data.forEach(addOpenAIItem);

  const payload = data?.data && typeof data.data === 'object' && !Array.isArray(data.data)
    ? data.data
    : data?.result && typeof data.result === 'object' && !Array.isArray(data.result)
      ? data.result
      : data;

  if (Array.isArray(payload?.results))
    payload.results.forEach((item: any) => addUrl(item?.url || item?.imageUrl || item?.image_url || item?.image));
  if (Array.isArray(payload?.data))
    payload.data.forEach(addOpenAIItem);

  addUrl(payload?.url || payload?.imageUrl || payload?.image_url || payload?.image);
  if (typeof payload?.result === 'string' && (payload.result.startsWith('http') || payload.result.startsWith('data:')))
    addUrl(payload.result);

  const part = payload?.candidates?.[0]?.content?.parts?.find((candidatePart: any) => candidatePart.inlineData?.data);
  if (part?.inlineData?.data)
    addUrl(`data:image/png;base64,${part.inlineData.data}`);

  return [...new Set(urls)];
}

export function toLocalImageTaskApiResponse(task: LocalImageTask) {
  const images = normalizeResultUrls(task.resultUrls);
  const firstImage = images[0] || null;
  const rawProgress = Number((task.responsePayload as any)?.progress);
  const progress = task.status === 'SUCCESS'
    ? 100
    : task.status === 'FAILED'
      ? 100
      : Number.isFinite(rawProgress)
        ? Math.max(0, Math.min(99, Math.round(rawProgress)))
        : 0;

  return {
    taskId: task.id,
    id: task.id,
    task_id: task.id,
    status: task.status,
    progress,
    provider: task.provider,
    modelId: task.modelId,
    pricingModelId: task.pricingModelId,
    mode: task.mode,
    upstreamTaskId: task.upstreamTaskId,
    url: firstImage,
    image_url: firstImage,
    images,
    results: images.map((url) => ({ url })),
    data: images.map((url) => ({ url })),
    error: task.errorText,
    errorText: task.errorText,
    responsePayload: task.responsePayload,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    finishedAt: task.finishedAt,
  };
}
