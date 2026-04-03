import * as React from 'react';
import { Box, Typography, Chip } from '@mui/joy';
import CalculateIcon from '@mui/icons-material/Calculate';

export function AboutSettings() {
  return (
    <Box sx={{ p: { xs: 2, md: 3 }, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1.5 }}>
      {/* Icon with blueprint gradient */}
      <Box
        sx={{
          width: 56,
          height: 56,
          background: 'linear-gradient(135deg, #1E3A5F 0%, #3B82F6 100%)',
          borderRadius: '14px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 8px rgba(0,0,0,0.1)',
          mb: 0.5,
        }}
      >
        <CalculateIcon sx={{ fontSize: 32, color: 'white' }} />
      </Box>

      <Typography level="title-lg" sx={{ fontWeight: 'bold' }}>
        数学建模工作台
      </Typography>

      <Chip variant="soft" size="sm">
        v1.1.0
      </Chip>

      <Typography
        level="body-sm"
        sx={{
          textAlign: 'justify',
          textJustify: 'inter-ideograph',
          maxWidth: 600,
          color: 'text.secondary',
          lineHeight: 1.5,
          letterSpacing: '0.01em',
          mt: 1,
          px: 1,
        }}
      >
        数学建模工作台（Math Modeling Workbench）是专为学术竞赛、科研分析及工程建模量身打造的智能协作系统。我们深度集成了 LaTeX 实时公式引擎、多模型并行推演能力及高精度文档解析模块，支持对 PDF、Excel 及物理实验数据的深度挖掘。无论是复杂的公式推演、海量的数据归纳，还是多维度的模型方案对比，工作台都将通过前沿 AI 技术重塑您的数模工作流，助力参赛者在严谨的逻辑中探索无限可能。
      </Typography>

      <Typography
        level="body-xs"
        sx={{
          color: 'danger.plainColor',
          textAlign: 'center',
          maxWidth: 500,
          background: 'rgba(var(--joy-palette-danger-mainChannel) / 0.05)',
          py: 1,
          px: 1.5,
          borderRadius: 'md',
          border: '1px solid',
          borderColor: 'danger.softBorder',
          mt: 1,
        }}
      >
        ⚠️ 本站 API 仅适用于技术测试和体验目的，请自觉遵守您当地的法律法规，切勿用于任何非法用途。本站不承担任何因违规使用产生的法律责任。
      </Typography>

      <Typography level="body-xs" sx={{ color: 'text.tertiary', mt: 1.5, mb: 1 }}>
        © 2025 Aittco Team. All rights reserved.
      </Typography>
    </Box>
  );
}
