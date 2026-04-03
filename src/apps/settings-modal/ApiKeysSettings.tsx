import * as React from 'react';

import { Alert, Box, Card, Chip, Divider, Stack, Typography } from '@mui/joy';
import RocketLaunchIcon from '@mui/icons-material/RocketLaunch';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

/**
 * 账户状态与余额组件
 * 展示系统已授权的状态，引导用户关注金币余额
 */
export function ApiKeysSettings() {
  return (
    <Stack gap={1.5}>
      
      {/* 顶部说明 */}
      <Box sx={{ mt: 1 }}>
        <Typography level="title-md" sx={{ mb: 0.5, fontWeight: 700 }}>
          🚀 账户状态与余额
        </Typography>
        <Typography level="body-xs" sx={{ color: 'text.secondary' }}>
          系统已全面升级为金币计费模式。
        </Typography>
      </Box>

      <Divider />

      {/* 配置卡片 */}
      <Card variant="soft" color="primary" sx={{ p: 3, textAlign: 'center', boxShadow: 'sm' }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
          <RocketLaunchIcon sx={{ fontSize: 48, mb: 1, color: 'primary.solidBg' }} />
          <Typography level="title-lg" sx={{ fontWeight: 800 }}>
            免密使用 · 已开启
          </Typography>
          <Typography level="body-md" sx={{ maxWidth: '80%', mx: 'auto', mb: 1 }}>
            现在您无需再输入任何 API Key，系统将自动使用云端密钥进行代理请求。
          </Typography>
          <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', justifyContent: 'center' }}>
            {['已授权 OpenAI', '已授权 Anthropic', '已授权 Gemini', '已授权 xAI', '已授权 Banana'].map((service) => (
              <Chip key={service} variant="soft" color="success" size="sm" startDecorator={<CheckCircleIcon sx={{ fontSize: 'md' }} />}>
                {service}
              </Chip>
            ))}
          </Box>
        </Box>
      </Card>


      <Divider />

      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5, alignItems: 'center', justifyContent: 'center', py: 1 }}>
        <Alert color="primary" variant="soft" sx={{ py: 1, px: 2, borderRadius: 'md', width: '100%' }}>
          <Typography level="body-sm" textAlign="center">
            <strong>💡 提示:</strong> 所有模型调用将直接从您的个人账户金币余额中扣除。
          </Typography>
        </Alert>
      </Box>

    </Stack>
  );
}
