import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '~/server/auth/jwt';
import { createGenerateLog, finalizeGenerateLog } from '~/server/services/generate-log.service';
import {
  buildGeminiEndpointUrl,
  buildGeminiGenerateContentUrl,
  createRelayAuthHeaders,
  encodeRelayTaskId,
  resolveVideoModelRoute,
} from '~/server/services/model-route.service';
import {
  buildVideoGeneratePayload,
  extractVideoTaskId,
  extractVideoUrl,
} from '../_shared';

export const runtime = 'nodejs';
export const maxDuration = 900;

function parseJson(text: string): any {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

function summarizeImages(images: any[]): Array<{ kind: string; length: number; hasDataUrlPrefix: boolean }> {
  return images.map((item) => ({
    kind: typeof item,
    length: typeof item === 'string' ? item.length : 0,
    hasDataUrlPrefix: typeof item === 'string' ? item.includes('base64,') : false,
  }));
}

function toInlineData(image: string): { mimeType: string; data: string } | null {
  if (!image || typeof image !== 'string')
    return null;
  const trimmed = image.trim();
  if (!trimmed)
    return null;

  if (trimmed.startsWith('data:')) {
    const match = trimmed.match(/^data:([^;]+);base64,(.+)$/);
    if (!match)
      return null;
    return {
      mimeType: match[1] || 'image/png',
      data: match[2] || '',
    };
  }

  return {
    mimeType: 'image/png',
    data: trimmed.includes('base64,') ? trimmed.split('base64,')[1] : trimmed,
  };
}

function buildGeminiVideoGenerateContentPayload(input: {
  prompt: string;
  aspectRatio?: string;
  duration?: number;
  hd?: boolean;
  resolution?: string;
  images?: string[];
}): Record<string, any> {
  const parts: any[] = [{ text: input.prompt }];
  for (const image of input.images || []) {
    const inlineData = toInlineData(image);
    if (inlineData?.data)
      parts.push({ inlineData });
  }

  const generationConfig: Record<string, any> = {
    responseModalities: ['VIDEO'],
  };
  if (input.aspectRatio)
    generationConfig.aspectRatio = input.aspectRatio;
  if (typeof input.duration === 'number' && Number.isFinite(input.duration))
    generationConfig.durationSeconds = Math.max(1, Math.round(input.duration));
  if (input.resolution)
    generationConfig.resolution = input.resolution;
  if (typeof input.hd === 'boolean')
    generationConfig.hd = input.hd;

  return {
    contents: [{ role: 'user', parts }],
    generationConfig,
  };
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const payload = token ? verifyAccessToken(token) : null;
  if (!payload?.userId)
    return NextResponse.json({ message: '请先登录', detail: '请先登录' }, { status: 401 });

  const body = await req.json();
  let requestLogId: string | null = null;

  const finalizeLogIfNeeded = async (
    result: 'TASK_ID' | 'PROCESSING' | 'SUCCESS' | 'FAILED' | 'ERROR',
    responsePayload: any,
    statusCode?: number | null,
    errorText?: string | null,
  ) => {
    if (!requestLogId)
      return;

    try {
      await finalizeGenerateLog({
        logId: requestLogId,
        statusCode,
        result,
        responsePayload,
        errorText,
      });
    } catch (logError) {
      console.warn('[video/generate] finalize log failed', logError);
    }
  };

  const model = String(body?.model || '').trim();
  const prompt = String(body?.prompt || '').trim();
  if (!model || !prompt) {
    await finalizeLogIfNeeded('ERROR', { body }, 400, 'model/prompt missing');
    return NextResponse.json({ message: '缺少必要参数', detail: 'model 和 prompt 为必填' }, { status: 400 });
  }

  const inputImages = Array.isArray(body?.images)
    ? body.images
    : (body?.image ? [body.image] : []);

  let route;
  try {
    route = await resolveVideoModelRoute(model);
  } catch (error: any) {
    const message = error?.message || '无法解析视频模型路由';
    await finalizeLogIfNeeded('ERROR', { body }, 500, message);
    return NextResponse.json({ message, detail: message }, { status: 500 });
  }

  let upstreamPayload = buildVideoGeneratePayload({
    model: route.upstreamModel,
    prompt,
    aspect_ratio: body?.aspect_ratio || body?.size || body?.ratio,
    duration: body?.duration,
    hd: body?.hd,
    images: inputImages,
    options: body?.options && typeof body.options === 'object' ? body.options : undefined,
  });

  if (route.transport === 'gemini-generate-content') {
    upstreamPayload = buildGeminiVideoGenerateContentPayload({
      prompt,
      aspectRatio: String(body?.aspect_ratio || body?.size || body?.ratio || '16:9'),
      duration: Number(body?.duration || 5),
      hd: Boolean(body?.hd),
      resolution: String((upstreamPayload as any)?.input_config?.resolution || body?.resolution || ''),
      images: inputImages,
    });
  }

  try {
    requestLogId = await createGenerateLog({
      userId: payload.userId,
      endpoint: '/api/video/generate',
      phase: 'SUBMIT',
      model,
      prompt,
      size: String(body?.aspect_ratio || body?.size || body?.ratio || '16:9'),
      resolution: String(upstreamPayload?.input_config?.resolution || body?.resolution || ''),
      batch: 1,
      imagesCount: inputImages.length,
      requestPayload: {
        ...body,
        route: {
          routeId: route.routeId,
          transport: route.transport,
          endpointPath: route.endpointPath || '',
          baseUrl: route.baseUrl,
          upstreamModel: route.upstreamModel,
        },
        upstreamPayload,
        images: summarizeImages(inputImages),
        imagesCount: inputImages.length,
      },
    });
  } catch (logError) {
    console.warn('[video/generate] create log failed', logError);
  }

  const targetUrl = route.transport === 'gemini-generate-content'
    ? (route.endpointPath
        ? buildGeminiEndpointUrl(route, route.endpointPath)
        : buildGeminiGenerateContentUrl(route, route.upstreamModel))
    : `${route.baseUrl}${route.endpointPath || '/v2/videos/generations'}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(route.transport === 'gemini-generate-content' ? {} : createRelayAuthHeaders(route)),
  };

  const upstreamRes = await fetch(targetUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(upstreamPayload),
    signal: AbortSignal.timeout(600_000),
  });

  const text = await upstreamRes.text();
  const data = parseJson(text);

  if (!upstreamRes.ok) {
    const message = data?.error?.message || data?.message || data?.detail || text || '视频任务提交失败';
    await finalizeLogIfNeeded('ERROR', { upstream: data }, upstreamRes.status, message);
    return NextResponse.json({ message, detail: message, upstream: data }, { status: upstreamRes.status });
  }

  const upstreamTaskId = extractVideoTaskId(data);
  if (upstreamTaskId) {
    const taskId = encodeRelayTaskId(route.routeId, upstreamTaskId);
    await finalizeLogIfNeeded('TASK_ID', { taskId, upstreamTaskId, upstream: data }, 200);
    return NextResponse.json({ taskId, upstream: data });
  }

  const videoUrl = extractVideoUrl(data);
  if (videoUrl) {
    const successPayload = {
      status: 'success',
      progress: 100,
      video_url: videoUrl,
      upstream: data,
    };
    await finalizeLogIfNeeded('SUCCESS', successPayload, 200);
    return NextResponse.json(successPayload);
  }

  await finalizeLogIfNeeded('ERROR', { upstream: data }, 502, 'upstream missing taskId/video_url');
  return NextResponse.json({
    message: '中转站返回成功但未提供 taskId 或视频地址',
    detail: 'upstream missing taskId/video_url',
    upstream: data,
  }, { status: 502 });
}
