export type ModelPricingCategory = 'CHAT' | 'IMAGE' | 'VIDEO';

export type ModelPricingSnapshot = {
  modelId: string;
  modelName: string;
  category: ModelPricingCategory;
  coinCost: number;
  isActive: boolean;
};

export type ChatModelCatalogEntry = ModelPricingSnapshot & {
  vendor: 'openai' | 'anthropic';
  description: string;
};

export const CHAT_MODEL_CATALOG: readonly ChatModelCatalogEntry[] = [
  {
    modelId: 'gpt-5.4',
    modelName: 'GPT-5.4',
    vendor: 'openai',
    category: 'CHAT',
    coinCost: 4,
    isActive: true,
    description: 'GPT-5.4：新一代通用旗舰模型，代码、推理、写作与工具调用能力全面。',
  },
  {
    modelId: 'gpt-5.5',
    modelName: 'GPT-5.5',
    vendor: 'openai',
    category: 'CHAT',
    coinCost: 6,
    isActive: true,
    description: 'GPT-5.5：增强复杂推理与指令遵循能力，适合高要求分析和生产任务。',
  },
  {
    modelId: 'gpt-5.6-sol',
    modelName: 'GPT-5.6-Sol',
    vendor: 'openai',
    category: 'CHAT',
    coinCost: 6,
    isActive: true,
    description: 'GPT-5.6 Sol：面向深度推理和软件工程任务优化，强调准确性与完整性。',
  },
  {
    modelId: 'gpt-5.6-terra',
    modelName: 'GPT-5.6-Terra',
    vendor: 'openai',
    category: 'CHAT',
    coinCost: 5,
    isActive: true,
    description: 'GPT-5.6 Terra：兼顾响应效率与综合质量，适合日常开发和通用工作流。',
  },
  {
    modelId: 'claude-opus-4-6',
    modelName: 'Claude-Opus-4-6',
    vendor: 'anthropic',
    category: 'CHAT',
    coinCost: 6,
    isActive: true,
    description: 'Claude Opus 4.6：高端旗舰模型，擅长深度推理、长文写作与严谨表达。',
  },
  {
    modelId: 'claude-opus-4-7',
    modelName: 'Claude-Opus-4-7',
    vendor: 'anthropic',
    category: 'CHAT',
    coinCost: 6,
    isActive: true,
    description: 'Claude Opus 4.7：强化长上下文理解和复杂分析，适合研究与专业写作。',
  },
  {
    modelId: 'claude-opus-4-8',
    modelName: 'Claude-Opus-4-8',
    vendor: 'anthropic',
    category: 'CHAT',
    coinCost: 7,
    isActive: true,
    description: 'Claude Opus 4.8：面向最高质量推理与内容生成，适合高难度综合任务。',
  },
] as const;

const catalogById = new Map(CHAT_MODEL_CATALOG.map((entry) => [entry.modelId, entry]));

export const CHAT_MODEL_DESCRIPTIONS: Readonly<Record<string, string>> = Object.fromEntries(
  CHAT_MODEL_CATALOG.map(({ modelId, description }) => [modelId, description]),
);

function isManagedChatModelId(modelId: string): boolean {
  const normalized = modelId.trim().replace(/^models\//i, '').toLowerCase();
  return normalized.startsWith('gpt-')
    || normalized.startsWith('claude-')
    || normalized.startsWith('openai/')
    || normalized.startsWith('anthropic/');
}

function needsCanonicalUpsert(
  current: ModelPricingSnapshot | undefined,
  target: ChatModelCatalogEntry,
): boolean {
  return !current
    || current.modelName !== target.modelName
    || current.category !== target.category
    || current.coinCost !== target.coinCost
    || current.isActive !== target.isActive;
}

export function getChatModelCatalogPlan(currentRows: readonly ModelPricingSnapshot[]): {
  upserts: ChatModelCatalogEntry[];
  deactivateModelIds: string[];
} {
  const currentByExactId = new Map(currentRows.map((row) => [row.modelId, row]));
  const upserts = CHAT_MODEL_CATALOG
    .filter((target) => needsCanonicalUpsert(currentByExactId.get(target.modelId), target))
    .map((target) => ({ ...target }));
  const deactivateModelIds = currentRows
    .filter((row) => row.category === 'CHAT'
      && row.isActive
      && isManagedChatModelId(row.modelId)
      && !catalogById.has(row.modelId))
    .map((row) => row.modelId)
    .sort();

  return { upserts, deactivateModelIds };
}
