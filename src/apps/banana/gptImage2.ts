import { resolveGptImage2Size } from './gptImage2Size';

export const GPT_IMAGE_2_MODEL_ID = 'gpt-image-2';

export type GptImage2Quality = 'auto' | 'low' | 'medium' | 'high';
export type GptImage2OutputFormat = 'png' | 'jpeg' | 'webp';
export type GptImage2Moderation = 'auto' | 'low';

export type GptImage2Params = {
  sizeMode?: string;
  size?: string;
  quality?: GptImage2Quality;
  output_format?: GptImage2OutputFormat;
  output_compression?: number;
  moderation?: GptImage2Moderation;
  n?: number;
  customWidth?: number;
  customHeight?: number;
};

export const DEFAULT_GPT_IMAGE_2_PARAMS: Required<Omit<GptImage2Params, 'customWidth' | 'customHeight'>> & {
  customWidth: number;
  customHeight: number;
} = {
  sizeMode: 'auto',
  size: 'auto',
  quality: 'high',
  output_format: 'png',
  output_compression: 100,
  moderation: 'auto',
  n: 1,
  customWidth: 1024,
  customHeight: 1024,
};

export function normalizeModelIdForGptImage2(modelId?: string): string {
  return String(modelId || '').trim().replace(/^models\//i, '').toLowerCase();
}

export function isGptImage2Model(modelId?: string): boolean {
  return normalizeModelIdForGptImage2(modelId) === GPT_IMAGE_2_MODEL_ID;
}

export function normalizeGptImage2Params(params?: GptImage2Params): Required<GptImage2Params> {
  const outputFormat = params?.output_format === 'jpeg' || params?.output_format === 'webp' || params?.output_format === 'png'
    ? params.output_format
    : DEFAULT_GPT_IMAGE_2_PARAMS.output_format;
  const compression = Number(params?.output_compression ?? DEFAULT_GPT_IMAGE_2_PARAMS.output_compression);
  const n = Number(params?.n ?? DEFAULT_GPT_IMAGE_2_PARAMS.n);
  const sizeMode = params?.sizeMode || params?.size || DEFAULT_GPT_IMAGE_2_PARAMS.sizeMode;
  const explicitSize = typeof params?.size === 'string' && (/^\d+x\d+$/i.test(params.size) || params.size === 'auto')
    ? params.size
    : null;

  return {
    sizeMode,
    size: explicitSize || resolveGptImage2Size({
      mode: sizeMode,
      aspectRatio: params?.size,
      customWidth: params?.customWidth,
      customHeight: params?.customHeight,
    }).size,
    quality: params?.quality || DEFAULT_GPT_IMAGE_2_PARAMS.quality,
    output_format: outputFormat,
    output_compression: Math.max(0, Math.min(100, Number.isFinite(compression) ? Math.round(compression) : 100)),
    moderation: params?.moderation || DEFAULT_GPT_IMAGE_2_PARAMS.moderation,
    n: Math.max(1, Math.min(10, Number.isFinite(n) ? Math.floor(n) : 1)),
    customWidth: Number(params?.customWidth || DEFAULT_GPT_IMAGE_2_PARAMS.customWidth),
    customHeight: Number(params?.customHeight || DEFAULT_GPT_IMAGE_2_PARAMS.customHeight),
  };
}
