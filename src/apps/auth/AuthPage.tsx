import React, { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  FormControl,
  FormLabel,
  IconButton,
  Input,
  Link,
  Stack,
  Typography,
} from '@mui/joy';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { useRouter } from 'next/router';
import { useAuthStore } from '~/common/stores/auth/useAuthStore';
import { apiQuery } from '~/common/util/trpc.client';

type ModelBadge = {
  name: string;
  short: string;
  color: string;
};

/**
 * 登录页（重构版）
 * 说明：
 * - 保留原有登录/注册业务逻辑
 * - 重点重做视觉结构（左40%工作流 + 右60%登录区）
 */
export const AuthPage: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [invitationCode, setInvitationCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const router = useRouter();
  const { setTokens, setUser } = useAuthStore();

  const loginMutation = apiQuery.auth.login.useMutation({
    onSuccess: (data) => {
      setTokens(data.accessToken, data.refreshToken);
      setUser(data.user);
      router.push('/');
    },
    onError: (err) => {
      setError(err.message || '登录失败，请检查账号或密码');
    },
  });

  const registerMutation = apiQuery.auth.register.useMutation({
    onSuccess: (data) => {
      setTokens(data.accessToken, data.refreshToken);
      setUser(data.user);
      router.push('/');
    },
    onError: (err) => {
      setError(err.message || '注册失败，邮箱或用户名可能已被占用');
    },
  });

  const modelBadges = useMemo<ModelBadge[]>(
    () => [
      { name: 'Gemini', short: 'Ge', color: 'linear-gradient(135deg,#6fd0ff,#5178ff)' },
      { name: 'Claude', short: 'Cl', color: 'linear-gradient(135deg,#ffba73,#f47f65)' },
      { name: 'GPT', short: 'GPT', color: 'linear-gradient(135deg,#66e3a6,#2f9f7b)' },
      { name: 'Nano Banana Pro', short: 'NBP', color: 'linear-gradient(135deg,#ffd97a,#d89a1f)' },
      { name: 'Nano Banana 2', short: 'NB2', color: 'linear-gradient(135deg,#d0b4ff,#7a5aff)' },
    ],
    [],
  );

  const inputSx = {
    '--Input-radius': '10px',
    '--Input-minHeight': '42px',
    bgcolor: 'rgba(8,15,35,0.72)',
    color: '#eaf4ff',
    border: '1px solid rgba(128,166,255,0.35)',
    transition: 'all 220ms ease',
    /* 输入框聚焦发光：科技蓝高亮 */
    '&:focus-within': {
      borderColor: '#4fe3ff',
      boxShadow: '0 0 0 1px rgba(79,227,255,0.85), 0 0 14px rgba(79,227,255,0.45)',
    },
  } as const;

  const workflowPanelSx = {
    borderRadius: '12px',
    border: '1px solid rgba(123,165,255,0.3)',
    background: 'linear-gradient(180deg, rgba(6,13,32,0.86), rgba(8,12,28,0.74))',
    p: 1.2,
  } as const;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isLogin) {
      if (!identifier) {
        setError('请输入邮箱或用户名');
        return;
      }
      loginMutation.mutate({ identifier, password });
      return;
    }

    if (!nickname) {
      setError('请输入您的昵称');
      return;
    }
    if (!email || !email.includes('@')) {
      setError('请输入有效的电子邮箱');
      return;
    }

    registerMutation.mutate({
      email,
      password,
      nickname,
      username: username || undefined,
      invitationCode,
    });
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        width: '100%',
        position: 'relative',
        overflow: 'hidden',
        background:
          'radial-gradient(circle at 20% 20%, rgba(38,74,180,0.32), transparent 40%), radial-gradient(circle at 78% 82%, rgba(83,34,156,0.26), transparent 36%), #0b0f19',
      }}
    >
      {/* 背景点阵纹理 */}
      <Box
        sx={{
          position: 'absolute',
          inset: 0,
          opacity: 0.35,
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(158,196,255,0.35) 1px, transparent 0), linear-gradient(120deg, rgba(66,111,255,0.2), transparent 45%), linear-gradient(300deg, rgba(109,67,188,0.2), transparent 45%)',
          backgroundSize: '18px 18px, 100% 100%, 100% 100%',
          pointerEvents: 'none',
        }}
      />

      {/* 数学暗纹 */}
      <Box
        sx={{
          position: 'absolute',
          left: { xs: 12, md: 42 },
          top: { xs: 54, md: 90 },
          color: 'rgba(178,200,255,0.18)',
          fontFamily: 'monospace',
          fontSize: { xs: 11, md: 13 },
          lineHeight: 1.62,
          whiteSpace: 'pre-wrap',
          pointerEvents: 'none',
          userSelect: 'none',
        }}
      >
        {`K = [ 1 0 -1 ]\n    [ 0 -2 0 ]\n    [ 0 0 1 ]\n\n∫ f(x)dx = λ\n∂L/∂θ = 0\nalgorithm optimize()\n  parse(input)\n  solve(cost)`}
      </Box>

      <Box
        sx={{
          position: 'relative',
          zIndex: 1,
          minHeight: '100vh',
          display: 'grid',
          gridTemplateColumns: { xs: '1fr', lg: '40% 60%' },
          alignItems: 'center',
          px: { xs: 2, md: 4 },
          py: { xs: 3, md: 4 },
          gap: { xs: 3, md: 4 },
        }}
      >
        {/* 左侧：工作流展示区 */}
        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <Card
            sx={{
              width: '100%',
              maxWidth: 470,
              borderRadius: '14px',
              border: '1px solid rgba(120,165,255,0.38)',
              background: 'rgba(9,16,39,0.62)',
              /* 毛玻璃层，增强景深 */
              backdropFilter: 'blur(8px)',
              WebkitBackdropFilter: 'blur(8px)',
              boxShadow: '0 0 0 1px rgba(115,158,255,0.18), 0 14px 34px rgba(2,8,22,0.58)',
              p: { xs: 2, md: 2.3 },
            }}
          >
            <Typography sx={{ color: '#f3f8ff', fontWeight: 800, fontSize: { xs: '1.7rem', md: '2.2rem' }, lineHeight: 1.08 }}>
              AGGREGATE AI, EMPOWER MODELING
            </Typography>
            <Typography sx={{ color: '#d2e4ff', fontWeight: 700, mt: 0.8, mb: 1.7 }}>聚合大模型，赋能建模</Typography>

            <Stack spacing={1.15}>
              <Box sx={workflowPanelSx}>
                <Typography sx={{ color: '#caddff', fontSize: 11, letterSpacing: '0.02em', mb: 0.6 }}>INPUT PROBLEM</Typography>
                <Box sx={{ border: '1px solid rgba(144,190,255,0.3)', borderRadius: '8px', px: 1, py: 0.8, color: '#ecf5ff', fontSize: 12.4 }}>
                  Fermat Spiral for modeling optimization?
                </Box>
                <Typography sx={{ color: 'rgba(206,220,255,0.7)', fontSize: 10.8, mt: 0.7 }}>步骤 1: 输入数学建模问题</Typography>
              </Box>

              <Box sx={workflowPanelSx}>
                <Typography sx={{ color: '#caddff', fontSize: 11, letterSpacing: '0.02em', mb: 0.6 }}>AI GENERATED SOLUTION</Typography>
                <Box
                  sx={{
                    border: '1px solid rgba(144,190,255,0.26)',
                    borderRadius: '8px',
                    px: 1,
                    py: 0.75,
                    color: '#dcecff',
                    fontSize: 11.5,
                    fontFamily: 'monospace',
                    lineHeight: 1.46,
                  }}
                >
                  {'> Gemini-3.1-pro suggests...'}
                  <br />
                  parameters: 3
                  <br />
                  objective: max
                  <br />
                  selection: Eu
                </Box>
                <Typography sx={{ color: 'rgba(206,220,255,0.7)', fontSize: 10.8, mt: 0.7 }}>步骤 2: AI 生成解答与逻辑 (Gemini / Claude / GPT)</Typography>
              </Box>

              <Box sx={workflowPanelSx}>
                <Typography sx={{ color: '#caddff', fontSize: 11, letterSpacing: '0.02em', mb: 0.6 }}>NANO BANANA GENERATED VISUALIZATION</Typography>
                <Box
                  sx={{
                    border: '1px solid rgba(144,190,255,0.26)',
                    borderRadius: '8px',
                    height: 88,
                    background:
                      'radial-gradient(circle at 50% 50%, rgba(132,232,255,0.75) 0%, rgba(69,127,255,0.45) 30%, rgba(18,29,67,0.7) 58%, rgba(7,12,29,0.95) 100%)',
                    display: 'grid',
                    placeItems: 'center',
                    color: '#e8f6ff',
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  生成图 · Nano Banana
                </Box>
                <Typography sx={{ color: 'rgba(206,220,255,0.7)', fontSize: 10.8, mt: 0.7 }}>步骤 3: AI 生成数据可视化配图 (Nano Banana)</Typography>
              </Box>
            </Stack>
          </Card>
        </Box>

        {/* 右侧：登录区 */}
        <Box sx={{ display: 'flex', justifyContent: 'center' }}>
          <Box sx={{ width: '100%', maxWidth: 760 }}>
            <Stack direction="row" justifyContent="center" spacing={0.7} sx={{ mb: 1.1, flexWrap: 'wrap' }}>
              {modelBadges.map((badge) => (
                <Box
                  key={badge.name}
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.45,
                    px: 0.75,
                    py: 0.28,
                    borderRadius: '999px',
                    border: '1px solid rgba(145,184,255,0.33)',
                    background: 'rgba(7,15,36,0.82)',
                    boxShadow: '0 0 10px rgba(95,153,255,0.34)',
                  }}
                >
                  <Box
                    sx={{
                      width: 14,
                      height: 14,
                      borderRadius: '4px',
                      display: 'grid',
                      placeItems: 'center',
                      fontSize: 7,
                      fontWeight: 800,
                      color: '#03121f',
                      background: badge.color,
                    }}
                  >
                    {badge.short}
                  </Box>
                  <Typography sx={{ color: '#dce9ff', fontSize: 10.6, fontWeight: 700 }}>{badge.name}</Typography>
                </Box>
              ))}
            </Stack>

            <Card
              sx={{
                width: '100%',
                maxWidth: 460,
                margin: '0 auto',
                borderRadius: '14px',
                border: '1px solid rgba(98,241,255,0.5)',
                background: 'rgba(10,18,43,0.58)',
                /* 登录卡片毛玻璃 */
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                boxShadow: '0 0 20px rgba(59,239,255,0.35), inset 0 0 20px rgba(85,188,255,0.12)',
                p: { xs: 2.2, md: 2.6 },
              }}
            >
              <Typography sx={{ textAlign: 'center', color: '#ffffff', fontWeight: 800, fontSize: '2rem', mb: 0.5 }}>
                欢迎回来
              </Typography>
              <Typography sx={{ textAlign: 'center', color: 'rgba(210,225,255,0.78)', fontSize: 12.5, mb: 1.6 }}>
                登录以继续使用模型与查看余额。
              </Typography>

              {error && (
                <Alert color="danger" variant="soft" sx={{ mb: 1.2 }}>
                  {error}
                </Alert>
              )}

              <form onSubmit={handleSubmit}>
                <Stack spacing={1.25}>
                  {isLogin ? (
                    <>
                      <FormControl required>
                        <FormLabel sx={{ color: '#d0e6ff', fontWeight: 700 }}>邮箱 / 用户名</FormLabel>
                        <Input placeholder="输入邮箱或用户名" value={identifier} onChange={(e) => setIdentifier(e.target.value)} sx={inputSx} />
                      </FormControl>
                      <FormControl required>
                        <FormLabel sx={{ color: '#d0e6ff', fontWeight: 700 }}>密码</FormLabel>
                        <Input
                          type={showPassword ? 'text' : 'password'}
                          placeholder="请输入密码"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          sx={inputSx}
                          endDecorator={
                            <IconButton onClick={() => setShowPassword(!showPassword)} sx={{ color: '#9cc8ff' }}>
                              {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                            </IconButton>
                          }
                        />
                      </FormControl>
                    </>
                  ) : (
                    <>
                      <FormControl required>
                        <FormLabel sx={{ color: '#d0e6ff', fontWeight: 700 }}>显示昵称</FormLabel>
                        <Input placeholder="请输入昵称" value={nickname} onChange={(e) => setNickname(e.target.value)} sx={inputSx} />
                      </FormControl>
                      <FormControl required>
                        <FormLabel sx={{ color: '#d0e6ff', fontWeight: 700 }}>电子邮箱</FormLabel>
                        <Input type="email" placeholder="your@email.com" value={email} onChange={(e) => setEmail(e.target.value)} sx={inputSx} />
                      </FormControl>
                      <FormControl>
                        <FormLabel sx={{ color: '#d0e6ff', fontWeight: 700 }}>登录用户名 (选填)</FormLabel>
                        <Input placeholder="自定义唯一 ID" value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} sx={inputSx} />
                      </FormControl>
                      <FormControl required>
                        <FormLabel sx={{ color: '#d0e6ff', fontWeight: 700 }}>密码</FormLabel>
                        <Input
                          type={showPassword ? 'text' : 'password'}
                          placeholder="至少 6 位密码"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          sx={inputSx}
                          endDecorator={
                            <IconButton onClick={() => setShowPassword(!showPassword)} sx={{ color: '#9cc8ff' }}>
                              {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                            </IconButton>
                          }
                        />
                      </FormControl>
                      <FormControl>
                        <FormLabel sx={{ color: '#d0e6ff', fontWeight: 700 }}>邀请码 (可选)</FormLabel>
                        <Input placeholder="输入邀请码" value={invitationCode} onChange={(e) => setInvitationCode(e.target.value.toUpperCase())} sx={inputSx} />
                      </FormControl>
                    </>
                  )}

                  <Button
                    type="submit"
                    loading={loginMutation.isPending || registerMutation.isPending}
                    sx={{
                      mt: 0.7,
                      py: 1.1,
                      borderRadius: '10px',
                      fontWeight: 800,
                      letterSpacing: '0.02em',
                      background: 'linear-gradient(180deg,#45ff8f 0%, #21e96e 100%)',
                      color: '#052313',
                      boxShadow: '0 0 18px rgba(53,250,140,0.45)',
                      '&:hover': {
                        background: 'linear-gradient(180deg,#5bff9d 0%, #35f07e 100%)',
                      },
                    }}
                  >
                    立即登录
                  </Button>
                </Stack>
              </form>

              <Box sx={{ mt: 1.55, textAlign: 'center' }}>
                <Typography level="body-sm" sx={{ color: 'rgba(218,232,255,0.86)' }}>
                  {isLogin ? '还没有账号？' : '已有账号？'}{' '}
                  <Link
                    component="button"
                    onClick={() => {
                      setIsLogin(!isLogin);
                      setError(null);
                    }}
                    sx={{ color: '#9accff', fontWeight: 700 }}
                  >
                    {isLogin ? '创建一个新账号' : '立即返回登录'}
                  </Link>
                </Typography>
              </Box>
              {isLogin && (
                <Box sx={{ mt: 0.35, textAlign: 'center' }}>
                  <Link
                    level="body-sm"
                    sx={{ color: 'rgba(174,205,244,0.76)', textDecoration: 'none' }}
                    onClick={() => alert('忘记密码？请联系管理员重置。')}
                  >
                    忘记密码？
                  </Link>
                </Box>
              )}
            </Card>
          </Box>
        </Box>
      </Box>
    </Box>
  );
};
