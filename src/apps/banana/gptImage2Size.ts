export type GptImage2SizeMode = 'auto' | '1K' | '2K' | '4K' | 'custom';

export type GptImage2AspectRatio = 'auto' | '1:1' | '16:9' | '9:16' | '4:3' | '3:4';

export type GptImage2ResolvedSize = {
  width?: number;
  height?: number;
  size: 'auto' | `${number}x${number}`;
};

const BASE_SHORT_SIDE: Record<Exclude<GptImage2SizeMode, 'auto' | 'custom'>, number> = {
  '1K': 1024,
  '2K': 2048,
  '4K': 4096,
};

const ASPECT_RATIO_MAP: Record<Exclude<GptImage2AspectRatio, 'auto'>, [number, number]> = {
  '1:1': [1, 1],
  '16:9': [16, 9],
  '9:16': [9, 16],
  '4:3': [4, 3],
  '3:4': [3, 4],
};

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

export function resolveGptImage2Size(params: {
  mode?: string;
  aspectRatio?: string;
  customWidth?: number;
  customHeight?: number;
}): GptImage2ResolvedSize {
  const mode = normalizeGptImage2SizeMode(params.mode);
  const aspectRatio = normalizeGptImage2AspectRatio(params.aspectRatio);

  if (mode === 'auto' || aspectRatio === 'auto')
    return { size: 'auto' };

  if (mode === 'custom') {
    const width = roundToMultiple(Number(params.customWidth || 1024), 16);
    const height = roundToMultiple(Number(params.customHeight || 1024), 16);
    return { width, height, size: `${width}x${height}` };
  }

  const [ratioW, ratioH] = ASPECT_RATIO_MAP[aspectRatio];
  const shortSide = BASE_SHORT_SIDE[mode];
  const width = ratioW >= ratioH
    ? roundToMultiple(shortSide * (ratioW / ratioH), 16)
    : shortSide;
  const height = ratioH > ratioW
    ? roundToMultiple(shortSide * (ratioH / ratioW), 16)
    : shortSide;

  return { width, height, size: `${width}x${height}` };
}
