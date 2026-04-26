export type GptImage2SizeMode = 'auto' | '1K' | '2K' | '4K' | 'custom';

export type GptImage2AspectRatio = 'auto' | '1:1' | '16:9' | '9:16' | '4:3' | '3:4';

export type GptImage2ResolvedSize = {
  width?: number;
  height?: number;
  size: 'auto' | `${number}x${number}`;
};

const ASPECT_RATIO_MAP: Record<Exclude<GptImage2AspectRatio, 'auto'>, [number, number]> = {
  '1:1': [1, 1],
  '16:9': [16, 9],
  '9:16': [9, 16],
  '4:3': [4, 3],
  '3:4': [3, 4],
};

const GPT_SIZE_PATTERN = /^\s*(\d+)\s*[xX]\s*(\d+)\s*$/;

function roundToMultiple(value: number, multiple: number): number {
  return Math.max(multiple, Math.round(value / multiple) * multiple);
}

export function normalizeGptImage2SizeMode(value?: string): GptImage2SizeMode {
  const normalized = String(value || 'auto').trim().toLowerCase();
  if (normalized === '1k')
    return '1K';
  if (normalized === '2k')
    return '2K';
  if (normalized === '4k')
    return '4K';
  if (normalized === 'custom')
    return 'custom';
  return 'auto';
}

export function normalizeGptImage2AspectRatio(value?: string): GptImage2AspectRatio {
  const normalized = String(value || 'auto').trim();
  if (normalized === '1:1' || normalized === '16:9' || normalized === '9:16' || normalized === '4:3' || normalized === '3:4')
    return normalized;
  return 'auto';
}

export function normalizeGptImage2Size(value?: string): string {
  const trimmed = String(value || '').trim();
  const match = trimmed.match(GPT_SIZE_PATTERN);
  if (!match)
    return trimmed;
  const width = roundToMultiple(Number(match[1]), 16);
  const height = roundToMultiple(Number(match[2]), 16);
  return `${width}x${height}`;
}

export function resolveGptImage2Size(params: {
  mode?: string;
  aspectRatio?: string;
  customWidth?: number;
  customHeight?: number;
}): GptImage2ResolvedSize {
  const mode = normalizeGptImage2SizeMode(params.mode);
  const aspectRatio = normalizeGptImage2AspectRatio(params.aspectRatio);

  if (mode === 'custom') {
    const width = roundToMultiple(Number(params.customWidth || 1024), 16);
    const height = roundToMultiple(Number(params.customHeight || 1024), 16);
    return { width, height, size: `${width}x${height}` };
  }

  if (mode === 'auto' || aspectRatio === 'auto')
    return { size: 'auto' };

  const [ratioW, ratioH] = ASPECT_RATIO_MAP[aspectRatio];

  if (ratioW === ratioH) {
    const side = mode === '1K' ? 1024 : mode === '2K' ? 2048 : 3840;
    return { width: side, height: side, size: `${side}x${side}` };
  }

  if (mode === '1K') {
    const shortSide = 1024;
    const width = ratioW > ratioH
      ? roundToMultiple((shortSide * ratioW) / ratioH, 16)
      : shortSide;
    const height = ratioW > ratioH
      ? shortSide
      : roundToMultiple((shortSide * ratioH) / ratioW, 16);
    return { width, height, size: `${width}x${height}` };
  }

  const longSide = mode === '2K' ? 2048 : 3840;
  const width = ratioW > ratioH
    ? longSide
    : roundToMultiple((longSide * ratioW) / ratioH, 16);
  const height = ratioW > ratioH
    ? roundToMultiple((longSide * ratioH) / ratioW, 16)
    : longSide;

  return { width, height, size: `${width}x${height}` };
}
