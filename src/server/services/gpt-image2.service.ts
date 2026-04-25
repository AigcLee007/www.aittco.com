import { Buffer } from 'node:buffer';
import {
  DEFAULT_GPT_IMAGE_2_PARAMS,
  GPT_IMAGE_2_MODEL_ID,
  isGptImage2Model,
  normalizeGptImage2Params,
  type GptImage2Params,
} from '~/apps/banana/gptImage2';
import { resolveGptImage2Size } from '~/apps/banana/gptImage2Size';
import {
  assertRelayRouteIsConfigured,
  createRelayAuthHeaders,
  resolveImageModelRoute,
} from './model-route.service';
import {
  checkBalance,
  releaseReservedCoins,
  reserveCoins,
  settleReservedCoins,
} from './coin.service';
import { getModelPrice } from './pricing.service';
import {
  completeLocalImageTask,
  createLocalImageTask,
  failLocalImageTask,
  type LocalImageTask,
} from './image-task.service';

export class LocalImageTaskSubmitError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = 'LocalImageTaskSubmitError';
    this.status = status;
  }
}

type SubmitGptImage2LocalTaskParams = {
  userId: string;
  prompt: string;
  images?: string[];
  model?: string;
  pricingModelId?: string;
  aspectRatio?: string;
  resolution?: string;
  gptImage2?: GptImage2Params;
};

type GptImage2ResolvedRequest = {
  model: string;
  pricingModelId: string;
  prompt: string;
  images: string[];
  params: Required<GptImage2Params>;
  mode: 'generation' | 'edit';
};

function clampN(value?: number): number {
  const n = Number(value ?? 1);
  if (!Number.isFinite(n))
    return 1;
  return Math.max(1, Math.min(10, Math.floor(n)));
}

function normalizeModelId(modelId?: string): string {
  return String(modelId || '').trim().replace(/^models\//i, '').toLowerCase();
}

export function isGptImage2TaskBody(body: any): boolean {
  return isGptImage2Model(body?.pricingModelId || body?.model);
}

function resolveSubmission(input: SubmitGptImage2LocalTaskParams): GptImage2ResolvedRequest {
  const prompt = String(input.prompt || '').trim();
  if (!prompt)
    throw new LocalImageTaskSubmitError('缺少 prompt 参数');

  const model = normalizeModelId(input.model || input.pricingModelId || GPT_IMAGE_2_MODEL_ID) || GPT_IMAGE_2_MODEL_ID;
  const pricingModelId = normalizeModelId(input.pricingModelId || input.model || GPT_IMAGE_2_MODEL_ID) || GPT_IMAGE_2_MODEL_ID;
  const incomingParams = input.gptImage2 || {};
  const sizeMode = incomingParams.sizeMode || input.resolution || DEFAULT_GPT_IMAGE_2_PARAMS.sizeMode;
  const resolvedSize = resolveGptImage2Size({
    mode: sizeMode,
    aspectRatio: incomingParams.size || input.aspectRatio || 'auto',
    customWidth: incomingParams.customWidth,
    customHeight: incomingParams.customHeight,
  });
  const params = normalizeGptImage2Params({
    ...incomingParams,
    sizeMode,
    size: resolvedSize.size,
    n: clampN(incomingParams.n),
  });
  const images = Array.isArray(input.images)
    ? input.images.map((item) => String(item || '').trim()).filter(Boolean)
    : [];

  return {
    model,
    pricingModelId,
    prompt,
    images,
    params,
    mode: images.length > 0 ? 'edit' : 'generation',
  };
}

function buildGptImage2GenerationRequest(request: GptImage2ResolvedRequest): Record<string, any> {
  return {
    model: request.model,
    prompt: request.prompt,
    size: request.params.size,
    quality: request.params.quality,
    output_format: request.params.output_format,
    moderation: request.params.moderation,
    output_compression: request.params.output_compression,
    n: request.params.n,
  };
}

async function imageInputToBlob(input: string, index: number): Promise<{ blob: Blob; filename: string }> {
  if (/^https?:\/\//i.test(input)) {
    const response = await fetch(input, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok)
      throw new Error(`参考图下载失败: ${response.status}`);
    const contentType = response.headers.get('content-type') || 'image/png';
    const bytes = await response.arrayBuffer();
    return {
      blob: new Blob([bytes], { type: contentType }),
      filename: `reference-${index + 1}.${contentType.includes('jpeg') ? 'jpg' : contentType.includes('webp') ? 'webp' : 'png'}`,
    };
  }

  const dataUrlMatch = input.match(/^data:([^;,]+)?;base64,(.*)$/s);
  const mimeType = dataUrlMatch?.[1] || 'image/png';
  const base64 = dataUrlMatch ? dataUrlMatch[2] : input;
  const buffer = Buffer.from(base64, 'base64');
  return {
    blob: new Blob([buffer], { type: mimeType }),
    filename: `reference-${index + 1}.${mimeType.includes('jpeg') ? 'jpg' : mimeType.includes('webp') ? 'webp' : 'png'}`,
  };
}

async function buildGptImage2EditRequest(request: GptImage2ResolvedRequest): Promise<FormData> {
  const form = new FormData();
  form.append('model', request.model);
  form.append('prompt', request.prompt);
  form.append('size', request.params.size);
  form.append('quality', request.params.quality);
  form.append('output_format', request.params.output_format);
  form.append('moderation', request.params.moderation);
  form.append('output_compression', String(request.params.output_compression));
  form.append('n', String(request.params.n));

  for (let i = 0; i < request.images.length; i++) {
    const image = await imageInputToBlob(request.images[i], i);
    form.append('image[]', image.blob, image.filename);
  }

  return form;
}

function tryParseJson(text: string): any {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

function extractGptImage2Urls(data: any, outputFormat: string): string[] {
  const urls: string[] = [];
  const mime = outputFormat === 'jpeg' ? 'image/jpeg' : outputFormat === 'webp' ? 'image/webp' : 'image/png';
  const addItem = (item: any) => {
    if (!item || typeof item !== 'object')
      return;
    if (typeof item.url === 'string' && item.url.trim())
      urls.push(item.url.trim());
    if (typeof item.b64_json === 'string' && item.b64_json)
      urls.push(`data:${mime};base64,${item.b64_json}`);
  };

  if (Array.isArray(data?.data))
    data.data.forEach(addItem);
  if (Array.isArray(data?.data?.data))
    data.data.data.forEach(addItem);
  if (Array.isArray(data?.results))
    data.results.forEach((item: any) => {
      if (typeof item?.url === 'string')
        urls.push(item.url.trim());
    });

  return [...new Set(urls.filter(Boolean))];
}

async function postGptImage2Request(task: LocalImageTask, request: GptImage2ResolvedRequest): Promise<void> {
  try {
    const route = await resolveImageModelRoute(request.model);
    assertRelayRouteIsConfigured(route);

    const endpointPath = request.mode === 'edit'
      ? '/v1/images/edits'
      : route.endpointPath || '/v1/images/generations';
    const targetUrl = `${route.baseUrl.replace(/\/+$/, '')}${endpointPath.startsWith('/') ? endpointPath : `/${endpointPath}`}`;
    const upstreamModel = route.upstreamModel || request.model;
    const upstreamRequest = {
      ...request,
      model: upstreamModel,
    };
    const init: RequestInit = request.mode === 'edit'
      ? {
          method: 'POST',
          headers: createRelayAuthHeaders(route),
          body: await buildGptImage2EditRequest(upstreamRequest),
          signal: AbortSignal.timeout(600_000),
        }
      : {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...createRelayAuthHeaders(route),
          },
          body: JSON.stringify(buildGptImage2GenerationRequest(upstreamRequest)),
          signal: AbortSignal.timeout(600_000),
        };

    const response = await fetch(targetUrl, init);
    const responseText = await response.text();
    const responsePayload = tryParseJson(responseText);

    if (!response.ok) {
      const message = responsePayload?.error?.message || responsePayload?.message || responsePayload?.detail || responseText || 'GPT-image-2 上游请求失败';
      await failLocalImageTask(task.id, message, responsePayload);
      await releaseReservedCoins(task.id, message);
      return;
    }

    const urls = extractGptImage2Urls(responsePayload, request.params.output_format);
    if (!urls.length) {
      await failLocalImageTask(task.id, '任务成功但未返回图片', responsePayload);
      await releaseReservedCoins(task.id, '任务成功但未返回图片');
      return;
    }

    await completeLocalImageTask(task.id, urls, responsePayload);
    await settleReservedCoins(task.id, `生图消费: ${request.pricingModelId}`);
  } catch (error: any) {
    const message = error?.message || 'GPT-image-2 任务执行失败';
    await failLocalImageTask(task.id, message, { message });
    await releaseReservedCoins(task.id, message);
  }
}

export async function submitGptImage2LocalTask(input: SubmitGptImage2LocalTaskParams): Promise<{ taskId: string }> {
  const request = resolveSubmission(input);
  const price = await getModelPrice(request.pricingModelId);
  const totalPrice = price * request.params.n;

  if (totalPrice > 0) {
    const { isEnough } = await checkBalance(input.userId, totalPrice);
    if (!isEnough)
      throw new LocalImageTaskSubmitError(`余额不足，生图需要 ${totalPrice} 金币`, 402);
  }

  const task = await createLocalImageTask({
    userId: input.userId,
    provider: 'gpt-image-2',
    modelId: request.model,
    pricingModelId: request.pricingModelId,
    mode: request.mode,
    requestPayload: {
      prompt: request.prompt,
      imagesCount: request.images.length,
      params: request.params,
    },
  });

  if (totalPrice > 0) {
    try {
      await reserveCoins(input.userId, totalPrice, request.pricingModelId, task.id, `生图额度预占: ${request.pricingModelId} x ${request.params.n}`);
    } catch (error: any) {
      const message = error?.message || '余额预占失败';
      await failLocalImageTask(task.id, message, { message });
      throw new LocalImageTaskSubmitError(message, message.includes('余额') ? 402 : 400);
    }
  }

  void postGptImage2Request(task, request);
  return { taskId: task.id };
}
