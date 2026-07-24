import { prismaDb } from './src/server/prisma/prismaDb';
import { syncChatModelCatalog } from './src/server/services/chat-model-catalog.service';

syncChatModelCatalog()
  .then(({ upserted, deactivated }) => {
    console.log(`文本模型目录同步完成：更新 ${upserted} 条，停用 ${deactivated} 条。`);
  })
  .catch((error: unknown) => {
    console.error('文本模型目录同步失败:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prismaDb.$disconnect();
  });
