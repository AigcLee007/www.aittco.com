import { NextRequest, NextResponse } from 'next/server';
import { verifyAccessToken } from '~/server/auth/jwt';
import { createGenerateLog, finalizeGenerateLog } from '~/server/services/generate-log.service';
import {
  getLocalImageTask,
  toLocalImageTaskApiResponse,
} from '~/server/services/image-task.service';

export const runtime = 'nodejs';
export const maxDuration = 900;

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ taskId: string }> },
) {
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const payload = token ? verifyAccessToken(token) : null;
  if (!payload?.userId)
    return NextResponse.json({ message: '请先登录', detail: '请先登录' }, { status: 401 });

  const params = await context.params;
  const taskId = decodeURIComponent(params.taskId || '').trim();
  if (!taskId)
    return NextResponse.json({ message: 'taskId 无效', detail: 'taskId 无效' }, { status: 400 });

  let requestLogId: string | null = null;
  try {
    requestLogId = await createGenerateLog({
      userId: payload.userId,
      endpoint: '/api/task/:taskId',
      phase: 'POLL',
      model: 'polling-task',
      prompt: 'polling',
      taskId,
      batch: 1,
      imagesCount: 0,
      requestPayload: {
        taskId,
        path: req.nextUrl.pathname,
      },
    });
  } catch (logError) {
    console.warn('[task] create log failed', logError);
  }

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
      console.warn('[task] finalize log failed', logError);
    }
  };

  const task = await getLocalImageTask(taskId);
  if (!task) {
    await finalizeLogIfNeeded('ERROR', { message: '任务不存在' }, 404, '任务不存在');
    return NextResponse.json({ message: '任务不存在', detail: '任务不存在' }, { status: 404 });
  }

  if (task.userId !== payload.userId) {
    await finalizeLogIfNeeded('ERROR', { message: '无权查看该任务' }, 403, '无权查看该任务');
    return NextResponse.json({ message: '无权查看该任务', detail: '无权查看该任务' }, { status: 403 });
  }

  const responsePayload = toLocalImageTaskApiResponse(task);
  const result = task.status === 'SUCCESS'
    ? 'SUCCESS'
    : task.status === 'FAILED'
      ? 'FAILED'
      : 'PROCESSING';
  await finalizeLogIfNeeded(result, responsePayload, 200, task.errorText);
  return NextResponse.json(responsePayload);
}
