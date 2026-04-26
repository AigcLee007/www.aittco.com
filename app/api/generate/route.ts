import { NextRequest } from 'next/server';
import { verifyAccessToken } from '~/server/auth/jwt';
import { env } from '~/server/env.server';
import {
  checkBalance,
  listPendingReservationTaskKeys,
  releaseReservedCoins,
  rebindReservedTaskKey,
  reserveCoins,
  settleReservedCoins,
} from '~/server/services/coin.service';
import { getModelPrice } from '~/server/services/pricing.service';
import {
  isNanoBanana2VipModel,
  isNanoBananaProLine3Model,
  isNanoBananaProLine2Model,
  isNanoBananaProVipModel,
  mapNanoBanana2VipSizeToModel,
  mapNanoBananaLine1SizeToModel,
  NANO_BANANA_2_VIP_MODEL_ID,
  NANO_BANANA_PRO_LINE3_MODEL_ID,
  NANO_BANANA_PRO_LINE2_MODEL_ID,
  NANO_BANANA_PRO_VIP_MODEL_ID,
  normalizeNanoBananaLine1SizeToken,
} from '~/apps/banana/nanoBananaLine1';
import {
  completeLocalImageTask,
  createLocalImageTask,
  extractImageUrlsFromPayload,
  failLocalImageTask,
  getLocalImageTask,
  isLocalImageTaskId,
  markLocalImageTaskUpstream,
  toLocalImageTaskApiResponse,
} from '~/server/services/image-task.service';
import { resolveImageModelRoute } from '~/server/services/model-route.service';

export const runtime = 'nodejs';
export const maxDuration = 900;

const DEDICATED_TASK_PREFIX = {
  line2: 'banana-line2',
  vipPro: 'banana-vip-pro',
  vipBanana2: 'banana-vip-banana2',
} as const;

const DEFAULT_BASE_URL = 'https://api.bltcy.ai';
const DEFAULT_LINE2_API_KEY = 'sk-FmUQ0IlPza9U4Y14V9dPXo48jNZEevRiSldAV2By2RYJ4Ek9';
const DEFAULT_VIP_API_KEY = 'sk-pmtgFOrFhSxUvtFGdqvDdZ7FFoZRDwRDjP0u5Kpz3M7e7D3x';
const dedicatedTaskMonitors = new Set<string>();
let dedicatedReconcilerStarted = false;

type DedicatedModelKind = 'line2' | 'vipPro' | 'vipBanana2';

type GenerateRequestBody = {
  taskId?: string;
  model?: string;
  prompt?: string;
  size?: string;
  aspect_ratio?: string;
  n?: number;
  pricingModelId?: string;
  images?: string[];
  resolution?: string;
  gptImage2?: any;
};

function tryParseJson(text: string): any {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

function normalizeModelId(modelId?: string): string {
  return (modelId || '').trim().replace(/^models\//i, '').toLowerCase();
}

function identifyDedicatedModelKind(modelId?: string): DedicatedModelKind | null {
  const normalized = normalizeModelId(modelId);

  if (isNanoBananaProLine2Model(normalized))
    return 'line2';
  if (isNanoBananaProVipModel(normalized))
    return 'vipPro';
  if (isNanoBanana2VipModel(normalized))
    return 'vipBanana2';

  return null;
}

function encodeTaskId(kind: DedicatedModelKind, upstreamTaskId: string): string {
  return `${DEDICATED_TASK_PREFIX[kind]}:${upstreamTaskId}`;
}

function decodeTaskId(taskId: string): { kind: DedicatedModelKind; upstreamTaskId: string } | null {
  for (const [kind, prefix] of Object.entries(DEDICATED_TASK_PREFIX) as [DedicatedModelKind, string][]) {
    if (!taskId.startsWith(`${prefix}:`))
      continue;

    const upstreamTaskId = taskId.slice(prefix.length + 1).trim();
    if (upstreamTaskId)
      return { kind, upstreamTaskId };
  }

  return null;
}

function createReservationKey(userId: string, pricingModelId: string): string {
  return `reserve:${userId}:${pricingModelId}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;
}

function getBaseUrl(kind: DedicatedModelKind): string {
  const configured = kind === 'line2'
    ? process.env.NANO_BANANA_LINE2_BASE_URL || env.NANO_BANANA_LINE2_BASE_URL
    : process.env.NANO_BANANA_VIP_BASE_URL || env.NANO_BANANA_VIP_BASE_URL;

  return (configured || env.BLTCY_API_HOST || DEFAULT_BASE_URL).trim().replace(/\/+$/, '');
}

function getApiKey(kind: DedicatedModelKind): string {
  const configured = kind === 'line2'
    ? process.env.NANO_BANANA_LINE2_API_KEY || env.NANO_BANANA_LINE2_API_KEY || env.BLTCY_API_KEY || DEFAULT_LINE2_API_KEY
    : process.env.NANO_BANANA_VIP_API_KEY || env.NANO_BANANA_VIP_API_KEY || DEFAULT_VIP_API_KEY;

  return configured.trim();
}

function jsonError(message: string, status = 400) {
  return Response.json({ message, detail: message }, { status });
}

function normalizeAspectRatio(value?: string): string {
  const normalized = (value || '1:1').trim();
  const supported = new Set([
    '1:1',
    '1:4',
    '1:8',
    '2:3',
    '3:2',
    '3:4',
    '4:1',
    '4:3',
    '4:5',
    '5:4',
    '8:1',
    '9:16',
    '16:9',
    '21:9',
  ]);

  if (supported.has(normalized))
    return normalized;
  return '1:1';
}

function shouldHandleDedicated(body: GenerateRequestBody): boolean {
  if (typeof body.taskId === 'string')
    return !!decodeTaskId(body.taskId);
  return !!identifyDedicatedModelKind(body.pricingModelId) || !!identifyDedicatedModelKind(body.model);
}

function hasImageFromTaskResponse(data: any): boolean {
  const extractImage = (input: any): string | null => {
    if (Array.isArray(input?.data) && input.data.length > 0) {
      const item = input.data[0];
      if (typeof item?.url === 'string' && item.url)
        return item.url;
      if (typeof item?.b64_json === 'string' && item.b64_json)
        return `data:image/png;base64,${item.b64_json}`;
    }

    const payload = input?.data && typeof input.data === 'object' && !Array.isArray(input.data)
      ? input.data
      : input;

    if (Array.isArray(payload?.data) && payload.data.length > 0) {
      const nested = payload.data[0];
      if (typeof nested?.url === 'string' && nested.url)
        return nested.url;
      if (typeof nested?.b64_json === 'string' && nested.b64_json)
        return `data:image/png;base64,${nested.b64_json}`;
    }

    const directUrl = payload?.url || payload?.imageUrl || payload?.image_url || payload?.image;
    if (typeof directUrl === 'string' && directUrl)
      return directUrl;

    return null;
  };

  return !!extractImage(data);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function monitorDedicatedTaskAndSettle(taskId: string): Promise<void> {
  if (!taskId || dedicatedTaskMonitors.has(taskId))
    return;

  const decodedTask = decodeTaskId(taskId);
  if (!decodedTask)
    return;

  dedicatedTaskMonitors.add(taskId);
  try {
    const maxAttempts = 225; // ~15 minutes
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const upstreamResponse = await fetch(`${getBaseUrl(decodedTask.kind)}/v1/images/tasks/${encodeURIComponent(decodedTask.upstreamTaskId)}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${getApiKey(decodedTask.kind)}`,
        },
        signal: AbortSignal.timeout(30_000),
      });

      if (!upstreamResponse.ok) {
        if (upstreamResponse.status === 404 || upstreamResponse.status === 410) {
          await releaseReservedCoins(taskId, `任务查询失败: ${upstreamResponse.status}`);
          return;
        }
        await sleep(4000);
        continue;
      }

      const upstreamText = await upstreamResponse.text();
      const upstreamData = tryParseJson(upstreamText);
      const taskStatus = String(upstreamData?.status || upstreamData?.data?.status || '').toUpperCase();
      if (['FAILED', 'FAILURE', 'ERROR', 'CANCELED', 'TIMEOUT'].includes(taskStatus)) {
        await releaseReservedCoins(taskId, upstreamData?.fail_reason || taskStatus);
        return;
      }
      if (['SUCCESS', 'SUCCEEDED', 'COMPLETED', 'FINISHED'].includes(taskStatus)) {
        if (hasImageFromTaskResponse(upstreamData))
          await settleReservedCoins(taskId, `生图消费: ${taskId}`);
        else
          await releaseReservedCoins(taskId, '任务成功但未返回图片');
        return;
      }

      await sleep(4000);
    }
  } catch (error) {
    console.warn('[generate] dedicated monitor error', { taskId, error });
  } finally {
    dedicatedTaskMonitors.delete(taskId);
  }
}

function startDedicatedTaskMonitor(taskId: string): void {
  void monitorDedicatedTaskAndSettle(taskId);
}

function ensureDedicatedReservationReconcilerStarted(): void {
  if (dedicatedReconcilerStarted)
    return;
  dedicatedReconcilerStarted = true;

  setInterval(() => {
    void (async () => {
      try {
        const pendingKeys = await listPendingReservationTaskKeys(400);
        for (const key of pendingKeys) {
          if (
            key.startsWith(`${DEDICATED_TASK_PREFIX.line2}:`)
            || key.startsWith(`${DEDICATED_TASK_PREFIX.vipPro}:`)
            || key.startsWith(`${DEDICATED_TASK_PREFIX.vipBanana2}:`)
          ) {
            startDedicatedTaskMonitor(key);
          }
        }
      } catch (error) {
        console.warn('[generate] dedicated reconciler tick failed', error);
      }
    })();
  }, 60_000);
}

async function forwardToLegacyGenerate(req: NextRequest, rawBody: string): Promise<Response> {
  const headers = new Headers(req.headers);
  headers.delete('expect');
  headers.delete('host');
  headers.delete('connection');
  headers.delete('content-length');

  const response = await fetch(new URL('/api/generate-image', req.url), {
    method: 'POST',
    headers,
    body: rawBody,
  });

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

async function requireAuthedUser(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const payload = token ? verifyAccessToken(token) : null;
  if (!payload)
    return { error: jsonError('请先登录', 401) };
  return { payload };
}

function resolveUpstreamModel(kind: DedicatedModelKind, resolution: string): string {
  if (kind === 'vipBanana2')
    return mapNanoBanana2VipSizeToModel(resolution);
  return mapNanoBananaLine1SizeToModel(resolution);
}

function resolvePricingModelId(kind: DedicatedModelKind, resolution: string): string {
  const normalizedResolution = normalizeNanoBananaLine1SizeToken(resolution);

  if (kind === 'line2')
    return NANO_BANANA_PRO_LINE2_MODEL_ID;

  if (kind === 'vipPro') {
    if (normalizedResolution === '2k')
      return `${NANO_BANANA_PRO_VIP_MODEL_ID}-2k`;
    if (normalizedResolution === '4k')
      return `${NANO_BANANA_PRO_VIP_MODEL_ID}-4k`;
    return NANO_BANANA_PRO_VIP_MODEL_ID;
  }

  if (normalizedResolution === '2k')
    return `${NANO_BANANA_2_VIP_MODEL_ID}-2k`;
  if (normalizedResolution === '4k')
    return `${NANO_BANANA_2_VIP_MODEL_ID}-4k`;
  return NANO_BANANA_2_VIP_MODEL_ID;
}

async function postToUpstream(
  kind: DedicatedModelKind,
  payload: Record<string, any>,
  reservationTaskKey: string | null,
  pricingModelId: string,
): Promise<Response> {
  const upstreamResponse = await fetch(`${getBaseUrl(kind)}/v1/images/generations?async=true`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getApiKey(kind)}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(600_000),
  });

  const upstreamText = await upstreamResponse.text();
  const upstreamData = tryParseJson(upstreamText);

  if (!upstreamResponse.ok) {
    if (reservationTaskKey)
      await releaseReservedCoins(reservationTaskKey, upstreamData?.message || upstreamText || '上游请求失败');

    const message = upstreamData?.error?.message || upstreamData?.message || upstreamData?.detail || upstreamText || '上游请求失败';
    return jsonError(message, upstreamResponse.status);
  }

  const upstreamTaskId = upstreamData?.id
    || upstreamData?.task_id
    || upstreamData?.taskId
    || upstreamData?.data?.id
    || upstreamData?.data?.task_id
    || upstreamData?.data?.taskId;

  if (typeof upstreamTaskId === 'string' && upstreamTaskId.trim()) {
    const taskId = encodeTaskId(kind, upstreamTaskId.trim());
    if (reservationTaskKey) {
      await rebindReservedTaskKey(reservationTaskKey, taskId);
    }
    startDedicatedTaskMonitor(taskId);
    return Response.json({ taskId });
  }

  const directItem = Array.isArray(upstreamData?.data) ? upstreamData.data[0] : null;
  const directUrl = typeof directItem?.url === 'string'
    ? directItem.url
    : typeof directItem?.b64_json === 'string'
      ? `data:image/png;base64,${directItem.b64_json}`
      : null;

  if (directUrl) {
    if (reservationTaskKey)
      await settleReservedCoins(reservationTaskKey, `生图消费: ${pricingModelId}`);

    return new Response(directUrl, { status: 200, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }

  if (reservationTaskKey)
    await releaseReservedCoins(reservationTaskKey, '未获取到有效图片或任务 ID');

  return jsonError('未获取到有效任务 ID');
}

async function submitDedicatedTask(req: NextRequest, body: GenerateRequestBody): Promise<Response> {
  const auth = await requireAuthedUser(req);
  if (auth.error)
    return auth.error;

  const prompt = String(body.prompt || '').trim();
  const incomingModel = String(body.model || '').trim();
  const dedicatedKind = identifyDedicatedModelKind(body.pricingModelId) || identifyDedicatedModelKind(body.model);
  const aspectRatio = normalizeAspectRatio(body.aspect_ratio || body.size);
  const n = Number(body.n || 1);

  if (!dedicatedKind)
    return jsonError('链路识别失败');
  if (!prompt)
    return jsonError('缺少 prompt 参数');
  if (n !== 1)
    return jsonError('当前仅支持 n=1');

  const resolution = normalizeNanoBananaLine1SizeToken(body.size || '1k');
  const expectedModel = resolveUpstreamModel(dedicatedKind, resolution);
  const resolvedPricingModelId = resolvePricingModelId(dedicatedKind, resolution);

  if (incomingModel !== expectedModel) {
    const label = dedicatedKind === 'line2'
      ? 'Nano Banana Pro（线路二）'
      : dedicatedKind === 'vipPro'
        ? 'Nano Banana Pro(vip)'
        : 'Nano Banana 2(vip)';
    return jsonError(`${label} 模型映射错误，${resolution.toUpperCase()} 必须使用 ${expectedModel}`);
  }

  let reservationTaskKey: string | null = null;

  const price = await getModelPrice(resolvedPricingModelId);
  if (price > 0) {
    const { isEnough } = await checkBalance(auth.payload.userId, price);
    if (!isEnough)
      return jsonError(`余额不足，生图需要 ${price} 金币`, 402);

    reservationTaskKey = createReservationKey(auth.payload.userId, resolvedPricingModelId);
    await reserveCoins(auth.payload.userId, price, resolvedPricingModelId, reservationTaskKey, `生图额度预占: ${resolvedPricingModelId}`);
  }

  return postToUpstream(dedicatedKind, {
    model: expectedModel,
    prompt,
    size: resolution,
    aspect_ratio: aspectRatio,
    n: 1,
  }, reservationTaskKey, resolvedPricingModelId);
}

async function getLocalTaskResponse(req: NextRequest, taskId: string): Promise<Response> {
  const auth = await requireAuthedUser(req);
  if (auth.error)
    return auth.error;

  const task = await getLocalImageTask(taskId);
  if (!task)
    return jsonError('任务不存在', 404);
  if (task.userId !== auth.payload.userId)
    return jsonError('无权查看该任务', 403);

  return Response.json(toLocalImageTaskApiResponse(task));
}

function shouldHandleVisionary(body: GenerateRequestBody): boolean {
  if (body.taskId)
    return false;
  return isNanoBananaProLine3Model(body.pricingModelId) || isNanoBananaProLine3Model(body.model);
}

async function resolveVisionaryRoute(): Promise<{
  baseUrl: string;
  apiKey: string;
  endpointPath: string;
  upstreamModel: string;
}> {
  const route = await resolveImageModelRoute(NANO_BANANA_PRO_LINE3_MODEL_ID).catch(() => null);
  const isVisionaryRoute = route?.routeId === 'visionary' || route?.upstreamModel === 'Nano_Banana_Pro';
  const baseUrl = (
    (isVisionaryRoute ? route?.baseUrl : '')
    || process.env.VISIONARY_BASE_URL
    || env.VISIONARY_BASE_URL
    || 'https://visionary.beer'
  ).trim().replace(/\/+$/, '');
  const apiKey = (
    (isVisionaryRoute ? route?.apiKey : '')
    || process.env.VISIONARY_API_KEY
    || env.VISIONARY_API_KEY
    || ''
  ).trim();
  const endpointPath = (isVisionaryRoute ? route?.endpointPath : '') || '/openapi/v1/images/generations';
  const upstreamModel = (isVisionaryRoute ? route?.upstreamModel : '') || 'Nano_Banana_Pro';

  return {
    baseUrl,
    apiKey,
    endpointPath: endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`,
    upstreamModel,
  };
}

function startVisionaryLocalTask(taskId: string, requestPayload: Record<string, any>): void {
  void (async () => {
    try {
      const route = await resolveVisionaryRoute();
      if (!route.apiKey) {
        const message = 'Visionary API Key 未配置';
        await failLocalImageTask(taskId, message, { message });
        await releaseReservedCoins(taskId, message);
        return;
      }

      const response = await fetch(`${route.baseUrl}${route.endpointPath}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${route.apiKey}`,
        },
        body: JSON.stringify({
          ...requestPayload,
          model: route.upstreamModel,
        }),
        signal: AbortSignal.timeout(600_000),
      });

      const responseText = await response.text();
      const responsePayload = tryParseJson(responseText);
      if (!response.ok) {
        const message = responsePayload?.error?.message || responsePayload?.message || responsePayload?.detail || responseText || 'Visionary 上游请求失败';
        await failLocalImageTask(taskId, message, responsePayload);
        await releaseReservedCoins(taskId, message);
        return;
      }

      const normalizeStatus = (value: any): string => String(value || '').trim().toLowerCase();
      const isSuccessStatus = (status: string): boolean => ['succeeded', 'success', 'completed', 'finished'].includes(status);
      const isFailedStatus = (status: string): boolean => ['failed', 'failure', 'error', 'canceled', 'cancelled', 'timeout'].includes(status);
      const extractTaskId = (payload: any): string | null => {
        const id = payload?.id || payload?.task_id || payload?.taskId || payload?.data?.id || payload?.data?.task_id || payload?.data?.taskId;
        return typeof id === 'string' && id.trim() ? id.trim() : null;
      };
      const extractError = (payload: any): string | null => {
        const value = payload?.error?.message
          || payload?.error
          || payload?.failure_reason
          || payload?.fail_reason
          || payload?.message
          || payload?.detail
          || payload?.data?.error?.message
          || payload?.data?.error
          || payload?.data?.failure_reason
          || payload?.data?.fail_reason
          || payload?.data?.message
          || payload?.data?.detail;
        return typeof value === 'string' && value.trim() ? value.trim() : null;
      };
      const findTaskFromListPayload = (payload: any, upstreamTaskId: string): any | null => {
        const collections = [
          payload,
          payload?.data,
          payload?.items,
          payload?.list,
          payload?.records,
          payload?.tasks,
          payload?.results,
        ];

        for (const collection of collections) {
          if (!Array.isArray(collection))
            continue;
          const found = collection.find((item: any) => String(item?.id || item?.task_id || item?.taskId || '').trim() === upstreamTaskId);
          if (found)
            return found;
        }

        const rootId = String(payload?.id || payload?.task_id || payload?.taskId || '').trim();
        if (rootId && rootId === upstreamTaskId)
          return payload;

        return null;
      };

      const immediateUrls = extractImageUrlsFromPayload(responsePayload);
      if (immediateUrls.length > 0) {
        await completeLocalImageTask(taskId, immediateUrls, responsePayload);
        await settleReservedCoins(taskId, `生图消费: ${NANO_BANANA_PRO_LINE3_MODEL_ID}`);
        return;
      }

      const immediateStatus = normalizeStatus(responsePayload?.status || responsePayload?.data?.status);
      if (isFailedStatus(immediateStatus)) {
        const message = extractError(responsePayload) || 'Visionary 任务失败';
        await failLocalImageTask(taskId, message, responsePayload);
        await releaseReservedCoins(taskId, message);
        return;
      }

      const upstreamTaskId = extractTaskId(responsePayload);
      if (!upstreamTaskId) {
        const message = extractError(responsePayload)
          || (isSuccessStatus(immediateStatus) ? '任务成功但未返回图片' : 'Visionary 返回 processing 但未提供任务 ID');
        await failLocalImageTask(taskId, message, responsePayload);
        await releaseReservedCoins(taskId, message);
        return;
      }

      await markLocalImageTaskUpstream(taskId, upstreamTaskId, responsePayload);

      const listUrl = `${route.baseUrl}/openapi/v1/images/generations?page=1&limit=50`;
      const maxAttempts = 225;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const listResponse = await fetch(listUrl, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${route.apiKey}`,
          },
          signal: AbortSignal.timeout(60_000),
        });

        const listText = await listResponse.text();
        const listPayload = tryParseJson(listText);

        if (!listResponse.ok) {
          if (attempt < maxAttempts - 1) {
            await sleep(4000);
            continue;
          }
          const message = extractError(listPayload) || listText || 'Visionary 任务轮询失败';
          await failLocalImageTask(taskId, message, listPayload);
          await releaseReservedCoins(taskId, message);
          return;
        }

        const matchedTask = findTaskFromListPayload(listPayload, upstreamTaskId);
        if (!matchedTask) {
          await sleep(4000);
          continue;
        }

        await markLocalImageTaskUpstream(taskId, upstreamTaskId, matchedTask);

        const taskStatus = normalizeStatus(matchedTask?.status);
        const taskUrls = extractImageUrlsFromPayload(matchedTask);
        if (taskUrls.length > 0 && (isSuccessStatus(taskStatus) || !taskStatus)) {
          await completeLocalImageTask(taskId, taskUrls, matchedTask);
          await settleReservedCoins(taskId, `生图消费: ${NANO_BANANA_PRO_LINE3_MODEL_ID}`);
          return;
        }

        if (isFailedStatus(taskStatus)) {
          const message = extractError(matchedTask) || 'Visionary 任务失败';
          await failLocalImageTask(taskId, message, matchedTask);
          await releaseReservedCoins(taskId, message);
          return;
        }

        if (isSuccessStatus(taskStatus) && !taskUrls.length) {
          const message = extractError(matchedTask) || '任务成功但未返回图片';
          await failLocalImageTask(taskId, message, matchedTask);
          await releaseReservedCoins(taskId, message);
          return;
        }

        await sleep(4000);
      }

      await failLocalImageTask(taskId, 'Visionary 任务轮询超时', responsePayload);
      await releaseReservedCoins(taskId, 'Visionary 任务轮询超时');
    } catch (error: any) {
      const message = error?.message || 'Visionary 任务执行失败';
      await failLocalImageTask(taskId, message, { message });
      await releaseReservedCoins(taskId, message);
    }
  })();
}

async function submitVisionaryTask(req: NextRequest, body: GenerateRequestBody): Promise<Response> {
  const auth = await requireAuthedUser(req);
  if (auth.error)
    return auth.error;

  const prompt = String(body.prompt || '').trim();
  if (!prompt)
    return jsonError('缺少 prompt 参数');

  const n = Number(body.n || 1);
  if (n !== 1)
    return jsonError('Visionary 线路当前仅支持 n=1');

  const aspectRatio = normalizeAspectRatio(body.aspect_ratio || body.size);
  const resolution = normalizeNanoBananaLine1SizeToken(body.resolution || body.size || '1k');
  const pricingModelId = NANO_BANANA_PRO_LINE3_MODEL_ID;
  const price = await getModelPrice(pricingModelId);
  if (price > 0) {
    const { isEnough } = await checkBalance(auth.payload.userId, price);
    if (!isEnough)
      return jsonError(`余额不足，生图需要 ${price} 金币`, 402);
  }

  const requestPayload = {
    model: 'Nano_Banana_Pro',
    prompt,
    ratio: aspectRatio,
    imageSize: resolution.toUpperCase(),
    size: resolution,
    aspect_ratio: aspectRatio,
    n: 1,
  };
  const task = await createLocalImageTask({
    userId: auth.payload.userId,
    provider: 'visionary',
    modelId: 'Nano_Banana_Pro',
    pricingModelId,
    mode: 'background-local',
    requestPayload,
  });

  if (price > 0) {
    try {
      await reserveCoins(auth.payload.userId, price, pricingModelId, task.id, `生图额度预占: ${pricingModelId}`);
    } catch (error: any) {
      const message = error?.message || '余额预占失败';
      await failLocalImageTask(task.id, message, { message });
      return jsonError(message, message.includes('余额') ? 402 : 400);
    }
  }

  startVisionaryLocalTask(task.id, requestPayload);
  return Response.json({
    taskId: task.id,
    id: task.id,
    task_id: task.id,
    status: 'processing',
    progress: 0,
    results: [],
    images: [],
  });
}

async function pollDedicatedTask(taskId: string): Promise<Response> {
  const decodedTask = decodeTaskId(taskId);
  if (!decodedTask)
    return jsonError('无效的任务 ID');

  const upstreamResponse = await fetch(`${getBaseUrl(decodedTask.kind)}/v1/images/tasks/${encodeURIComponent(decodedTask.upstreamTaskId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${getApiKey(decodedTask.kind)}`,
    },
    signal: AbortSignal.timeout(600_000),
  });

  const upstreamText = await upstreamResponse.text();
  const upstreamData = tryParseJson(upstreamText);

  if (!upstreamResponse.ok) {
    const message = upstreamData?.error?.message || upstreamData?.message || upstreamData?.detail || upstreamText || '上游任务查询失败';
    return jsonError(message, upstreamResponse.status);
  }

  const taskStatus = String(upstreamData?.status || upstreamData?.data?.status || '').toUpperCase();
  if (['FAILED', 'FAILURE', 'ERROR', 'CANCELED', 'TIMEOUT'].includes(taskStatus)) {
    await releaseReservedCoins(taskId, upstreamData?.fail_reason || taskStatus);
  } else if (['SUCCESS', 'SUCCEEDED', 'COMPLETED', 'FINISHED'].includes(taskStatus)) {
    if (hasImageFromTaskResponse(upstreamData))
      await settleReservedCoins(taskId, `生图消费: ${taskId}`);
    else
      await releaseReservedCoins(taskId, '任务成功但未返回图片');
  }

  return Response.json(upstreamData);
}

export async function POST(req: NextRequest) {
  ensureDedicatedReservationReconcilerStarted();
  const rawBody = await req.text();
  let body: GenerateRequestBody = {};

  try {
    body = rawBody ? JSON.parse(rawBody) : {};
  } catch {
    return jsonError('请求体必须是有效 JSON');
  }

  if (body.taskId && isLocalImageTaskId(body.taskId))
    return getLocalTaskResponse(req, body.taskId);

  if (body.taskId && decodeTaskId(body.taskId))
    return pollDedicatedTask(body.taskId);

  if (shouldHandleVisionary(body))
    return submitVisionaryTask(req, body);

  if (!shouldHandleDedicated(body))
    return forwardToLegacyGenerate(req, rawBody);

  return submitDedicatedTask(req, body);
}
