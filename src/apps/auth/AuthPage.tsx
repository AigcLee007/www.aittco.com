import React, { useMemo, useState } from 'react';
import Image from 'next/image';
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
  Modal,
  ModalClose,
  ModalDialog,
  Stack,
  Typography,
} from '@mui/joy';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { useRouter } from 'next/router';
import { useAuthStore } from '~/common/stores/auth/useAuthStore';
import { apiQuery } from '~/common/util/trpc.client';

const frames = [
  { src: '/images/face-closeup.png', alt: '面部特写', sx: { left: '2%', top: '14%', width: { md: 128, lg: 160 }, height: { md: 176, lg: 224 } } },
  { src: '/images/accessory-shot.png', alt: '配饰细节', sx: { right: '3%', top: '10%', width: { md: 144, lg: 192 }, height: { md: 160, lg: 208 } } },
  { src: '/images/detail-texture-1.png', alt: '材质细节一', sx: { left: '7%', bottom: '22%', width: { md: 152, lg: 176 }, height: { md: 136, lg: 160 } } },
  { src: '/images/detail-texture-2.png', alt: '材质细节二', sx: { right: '6%', bottom: '24%', width: { md: 176, lg: 208 }, height: { md: 136, lg: 160 } } },
  { src: '/images/color-swatches.png', alt: '色彩样本', sx: { left: '18%', bottom: '7%', width: { md: 152, lg: 176 }, height: { md: 120, lg: 128 } } },
  { src: '/images/video-still-1.png', alt: '视频定格', sx: { right: '16%', bottom: '8%', width: { md: 160, lg: 192 }, height: { md: 120, lg: 144 } } },
];

const workflowCards = [
  { title: '文本模型', body: '在同一创作空间里调用 GPT、Gemini、Claude，从灵感到成稿自然衔接。' },
  { title: '图像模型', body: '使用 Nano Banana Pro 生成高质量视觉画面，构图与细节更精致。' },
  { title: '视频模型', body: '通过 Veo 3.1 Pro 将静态创意延展为动态内容，让创作流程不断线。' },
];

const scenes = ['活动创意概念', '商业视觉提案', '品牌内容素材', '短视频动效方向'];

export const AuthPage: React.FC = () => {
  const [isLogin, setIsLogin] = useState(true);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [open, setOpen] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [invitationCode, setInvitationCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);

  const router = useRouter();
  const { setTokens, setUser } = useAuthStore();

  const loginMutation = apiQuery.auth.login.useMutation({
    onSuccess: (data) => {
      setTokens(data.accessToken, data.refreshToken);
      setUser(data.user);
      router.push('/');
    },
    onError: (err) => setError(err.message || '登录失败，请检查账号或密码'),
  });

  const sendCodeMutation = apiQuery.auth.sendRegisterCode.useMutation({
    onSuccess: () => {
      setCountdown(60);
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    },
    onError: (err) => setError(err.message || '发送失败'),
  });

  const registerMutation = apiQuery.auth.register.useMutation({
    onSuccess: (data) => {
      setTokens(data.accessToken, data.refreshToken);
      setUser(data.user);
      router.push('/');
    },
    onError: (err) => setError(err.message || '注册失败，验证码错误或邮箱已占用'),
  });

  const sendResetCodeMutation = apiQuery.auth.sendPasswordResetCode.useMutation({
    onSuccess: () => {
      setCountdown(60);
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    },
    onError: (err) => setError(err.message || '发送失败'),
  });

  const resetPasswordMutation = apiQuery.auth.resetPassword.useMutation({
    onSuccess: () => {
      setError(null);
      setIsForgotPassword(false);
      setIsLogin(true);
      alert('密码重置成功，请使用新密码登录');
    },
    onError: (err) => setError(err.message || '重置失败'),
  });

  const sectionHeading = useMemo(() => ({
    label: { textAlign: 'center', fontSize: 12, letterSpacing: '0.26em', color: '#5d5952' },
    title: { textAlign: 'center', mt: 1.5, fontFamily: 'Times New Roman, Georgia, serif', fontWeight: 500, lineHeight: 1.12, fontSize: { xs: '1.85rem', md: '2.5rem' }, color: '#101010' },
    desc: { textAlign: 'center', mt: 2, mx: 'auto', maxWidth: 760, color: '#5d5952', fontSize: { xs: 14, md: 16 } },
  }), []);

  const inputSx = {
    '--Input-radius': '12px',
    '--Input-minHeight': '48px',
    bgcolor: '#fff',
    color: '#111',
    border: '1px solid #d6d0c4',
    '&:focus-within': {
      borderColor: '#111',
      boxShadow: '0 0 0 1px rgba(17,17,17,0.22)',
    },
  } as const;

  const openAuth = (loginMode: boolean) => {
    setIsLogin(loginMode);
    setIsForgotPassword(false);
    setError(null);
    setOpen(true);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (isForgotPassword) {
      if (!email || !email.includes('@'))
        return setError('请输入有效的电子邮箱');
      if (!code || code.length !== 6)
        return setError('请输入 6 位验证码');
      if (password.length < 6)
        return setError('新密码至少需要 6 位');
      resetPasswordMutation.mutate({ email, code, newPassword: password });
      return;
    }
    
    if (isLogin) {
      if (!identifier)
        return setError('请输入邮箱或用户名');
      loginMutation.mutate({ identifier, password });
      return;
    }
    
    if (!nickname)
      return setError('请输入您的昵称');
    if (!email || !email.includes('@'))
      return setError('请输入有效的电子邮箱');
    if (!code || code.length !== 6)
      return setError('请输入 6 位验证码');
    if (password.length < 6)
      return setError('密码至少需要 6 位');
      
    registerMutation.mutate({
      email,
      password,
      nickname,
      username: username || undefined,
      invitationCode,
      code,
    });
  };

  const handleSendCode = () => {
    if (!email || !email.includes('@'))
      return setError('请输入有效的电子邮箱');
    if (isForgotPassword) {
      sendResetCodeMutation.mutate({ email });
    } else {
      sendCodeMutation.mutate({ email });
    }
  };

  return (
    <Box
      sx={{
        height: '100vh',
        bgcolor: '#f6f5f2',
        color: '#101010',
        fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif',
        overflowY: 'auto',
        overflowX: 'hidden',
        touchAction: 'pan-y',
        scrollbarWidth: 'none',
        '&::-webkit-scrollbar': { display: 'none', width: 0, height: 0 },
        userSelect: 'none',
        '& *': { userSelect: 'none' },
        '& img': { userSelect: 'none', WebkitUserDrag: 'none', pointerEvents: 'none' },
      }}
    >
      <Box component='section' sx={{ borderBottom: '1px solid #dfdbd2', pt: { xs: 3, sm: 6, lg: 8 }, pb: { xs: 5, sm: 10, lg: 12 } }}>
        <Box sx={{ mx: 'auto', width: '100%', maxWidth: 1280, px: { xs: 2, sm: 4, lg: 6 } }}>
          <Box sx={{ mx: 'auto', textAlign: 'center', maxWidth: { xs: 560, md: 980 } }}>
            <Box sx={{ color: '#101010' }}>
              <Typography sx={{ color: '#101010', fontFamily: 'Times New Roman, Georgia, serif', fontWeight: 500, fontSize: { xs: '2rem', sm: '3.12rem', lg: '4.7rem' }, lineHeight: { xs: 1.14, sm: 1.08 } }}>
                在一个空间，完成
              </Typography>
              <Typography sx={{ color: '#101010', display: { xs: 'none', sm: 'block' }, fontFamily: 'Times New Roman, Georgia, serif', fontWeight: 500, mt: { sm: 0.3, lg: 0.45 }, fontSize: { sm: '3.12rem', lg: '4.7rem' }, lineHeight: 1.08, whiteSpace: 'nowrap' }}>
                高品质文本、图像与视频创作
              </Typography>
              <Typography sx={{ color: '#101010', display: { xs: 'block', sm: 'none' }, fontFamily: 'Times New Roman, Georgia, serif', fontWeight: 500, mt: 0.15, fontSize: '2rem', lineHeight: 1.14 }}>
                高品质文本、
                <br />
                图像与视频创作
              </Typography>
            </Box>
            <Button
              sx={{
                mt: { xs: 3.5, sm: 5 },
                width: { xs: '100%', sm: 'auto' },
                maxWidth: { xs: 220, sm: 'none' },
                borderRadius: '999px',
                px: 3.4,
                py: 1.1,
                bgcolor: '#05070d',
                color: '#f2f1ed',
                letterSpacing: '0.12em',
                fontSize: 12,
                '&:hover': { bgcolor: '#000' },
              }}
              onClick={() => openAuth(true)}
            >
              开始创作
            </Button>
          </Box>

          <Box sx={{ position: 'relative', mx: 'auto', mt: { xs: 6, lg: 8 }, width: '100%', maxWidth: 1152, height: { xs: 470, sm: 700 }, display: { xs: 'none', md: 'block' } }}>
            <Box component='svg' viewBox='0 0 1200 720' sx={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} aria-hidden>
              <path d='M242 242C322 188 398 168 486 168' stroke='#4A4742' strokeOpacity='0.3' />
              <path d='M712 170C842 176 934 212 1002 286' stroke='#4A4742' strokeOpacity='0.3' />
              <path d='M270 530C382 588 496 602 622 572' stroke='#4A4742' strokeOpacity='0.3' />
              <path d='M692 574C818 546 912 504 986 434' stroke='#4A4742' strokeOpacity='0.3' />
            </Box>
            <Box sx={{ position: 'absolute', left: '50%', top: '50%', width: { sm: 380, lg: 420 }, height: { sm: 500, lg: 560 }, transform: 'translate(-50%, -50%)', border: '1px solid #dfdbd2', bgcolor: '#fff', overflow: 'hidden', boxShadow: '0 20px 45px rgba(16,16,16,0.12)' }}>
              <Image src='/images/hero-main.png' alt='主视觉画面' fill priority style={{ objectFit: 'cover' }} />
            </Box>
            {frames.map((frame, idx) => (
              <Box
                key={frame.src}
                sx={{
                  position: 'absolute',
                  ...frame.sx,
                  border: '1px solid #dfdbd2',
                  bgcolor: '#fff',
                  overflow: 'hidden',
                  boxShadow: '0 10px 30px rgba(16,16,16,0.12)',
                  transition: 'transform 500ms',
                  '@keyframes drift': { '0%,100%': { transform: 'translateY(0)' }, '50%': { transform: 'translateY(-6px)' } },
                  animation: idx % 2 === 0 ? `drift 7s ease-in-out ${idx * 0.3}s infinite` : 'none',
                  '&:hover': { transform: 'translateY(-4px)' },
                }}
              >
                <Image src={frame.src} alt={frame.alt} fill style={{ objectFit: 'cover' }} />
              </Box>
            ))}
          </Box>

          <Box sx={{ display: { xs: 'grid', md: 'none' }, mt: 4.5, gridTemplateColumns: '1fr 1fr', gap: 1.2 }}>
            <Box sx={{ position: 'relative', border: '1px solid #dfdbd2', bgcolor: '#fff', overflow: 'hidden', height: 214 }}>
              <Image src='/images/hero-main.png' alt='main visual' fill style={{ objectFit: 'cover' }} />
            </Box>
            {frames.slice(0, 3).map((frame) => (
              <Box key={`mobile-${frame.src}`} sx={{ position: 'relative', border: '1px solid #dfdbd2', bgcolor: '#fff', overflow: 'hidden', height: 104 }}>
                <Image src={frame.src} alt={frame.alt} fill style={{ objectFit: 'cover' }} />
              </Box>
            ))}
          </Box>
        </Box>
      </Box>

      <Box component='section' sx={{ py: { xs: 6, sm: 10 } }}>
        <Box sx={{ mx: 'auto', width: '100%', maxWidth: 1280, px: { xs: 2, sm: 4, lg: 6 } }}>
          <Typography sx={sectionHeading.label}>统一工作流</Typography>
          <Typography sx={sectionHeading.title}>从概念到动态表达，一气呵成</Typography>
          <Typography sx={sectionHeading.desc}>在同一条优雅流程中完成文案、视觉与视频创作，兼顾速度与质感。</Typography>
          <Box sx={{ mt: 3, display: 'grid', gap: { xs: 1.2, sm: 2 }, gridTemplateColumns: { xs: '1fr', md: 'repeat(3,1fr)' } }}>
            {workflowCards.map((card) => (
              <Card key={card.title} variant='outlined' sx={{ border: '1px solid #dfdbd2', borderRadius: 0, bgcolor: '#f8f7f4', p: { xs: 2.2, sm: 3.2 }, '&:hover': { bgcolor: '#f3f1ec' } }}>
                <Typography sx={{ fontFamily: 'Times New Roman, Georgia, serif', fontSize: { xs: '1.5rem', sm: '2rem' }, color: '#101010' }}>{card.title}</Typography>
                <Typography sx={{ mt: 1.8, fontSize: 14, lineHeight: 1.75, color: '#5d5952' }}>{card.body}</Typography>
              </Card>
            ))}
          </Box>
        </Box>
      </Box>

      <Box component='section' sx={{ py: { xs: 6, sm: 10 } }}>
        <Box sx={{ mx: 'auto', width: '100%', maxWidth: 1280, px: { xs: 2, sm: 4, lg: 6 } }}>
          <Typography sx={sectionHeading.label}>高质输出展示</Typography>
          <Typography sx={sectionHeading.title}>为商业创意效率而生</Typography>
          <Typography sx={sectionHeading.desc}>快速产出活动概念、品牌视觉与短视频动效方向，同时保持高级审美质感。</Typography>
          <Box sx={{ mt: 3, display: 'grid', gap: 1.2, gridTemplateColumns: { xs: '1fr', sm: 'repeat(2,1fr)', lg: 'repeat(4,1fr)' } }}>
            {scenes.map((item) => (
              <Card key={item} variant='outlined' sx={{ borderRadius: 0, border: '1px solid #dfdbd2', bgcolor: '#fff', p: { xs: 2, sm: 2.4 } }}>
                <Typography sx={{ fontSize: 12, letterSpacing: '0.16em', color: '#5d5952' }}>应用场景</Typography>
                <Typography sx={{ mt: 1.4, fontFamily: 'Times New Roman, Georgia, serif', fontSize: { xs: '1.5rem', sm: '2rem' }, lineHeight: 1.15 }}>{item}</Typography>
              </Card>
            ))}
          </Box>
        </Box>
      </Box>

      <Modal disableScrollLock open={open} onClose={() => setOpen(false)}>
        <ModalDialog
          sx={{
            width: { xs: 'calc(100vw - 16px)', sm: 'min(560px, 92vw)' },
            maxHeight: { xs: '94vh', sm: '92vh' },
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            borderRadius: '22px',
            p: 0,
            border: '1px solid #d8d1c4',
            bgcolor: 'rgba(248,246,241,0.96)',
            backdropFilter: 'blur(14px)',
            boxShadow: '0 26px 70px rgba(16,16,16,0.26), inset 0 1px 0 rgba(255,255,255,0.95)',
          }}
        >
          <Box sx={{ px: { xs: 2, sm: 3 }, py: 2.4, borderBottom: '1px solid #e7e0d4', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Box>
              <Typography sx={{ fontFamily: 'Times New Roman, Georgia, serif', fontSize: { xs: '2.2rem', sm: '3rem' }, lineHeight: 1, color: '#3f3a33' }}>
                {isForgotPassword ? '重置密码' : (isLogin ? '欢迎回来' : '创建账号')}
              </Typography>
              <Typography sx={{ mt: 0.6, color: '#5d5952', fontSize: 14 }}>
                {isForgotPassword ? '请输入您的注册邮箱以获取验证码' : '登录以继续使用模型与查看余额'}
              </Typography>
            </Box>
            <ModalClose sx={{ position: 'static', color: '#6e6a61' }} />
          </Box>

          <Box sx={{ p: { xs: 2, sm: 3 } }}>
            {!isForgotPassword && (
              <Box sx={{ mb: 2, p: 0.5, borderRadius: '999px', border: '1px solid #d8d1c4', bgcolor: '#f0ece4', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0.5 }}>
                <Button size='sm' onClick={() => { setIsLogin(true); setError(null); }} sx={{ borderRadius: '999px', bgcolor: isLogin ? '#090b10' : 'transparent', color: isLogin ? '#f3f1ea' : '#676157', '&:hover': { bgcolor: isLogin ? '#090b10' : '#ebe5d9' } }}>
                  登录
                </Button>
                <Button size='sm' onClick={() => { setIsLogin(false); setError(null); }} sx={{ borderRadius: '999px', bgcolor: !isLogin ? '#090b10' : 'transparent', color: !isLogin ? '#f3f1ea' : '#676157', '&:hover': { bgcolor: !isLogin ? '#090b10' : '#ebe5d9' } }}>
                  注册
                </Button>
              </Box>
            )}

            {error && <Alert color='danger' variant='soft' sx={{ mb: 1.5 }}>{error}</Alert>}

            <form onSubmit={onSubmit}>
              <Stack spacing={1.35}>
                {isForgotPassword ? (
                  <>
                    <FormControl required>
                      <FormLabel sx={{ color: '#3f3c36', fontWeight: 700 }}>电子邮箱</FormLabel>
                      <Input
                        type='email'
                        placeholder='example@mail.com'
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        sx={inputSx}
                        endDecorator={
                          <Button
                            variant="plain"
                            disabled={countdown > 0 || sendResetCodeMutation.isPending}
                            onClick={handleSendCode}
                            sx={{
                              color: countdown > 0 ? '#999' : '#111',
                              fontWeight: 700,
                              fontSize: '13px',
                              minWidth: '100px',
                              '&:hover': { bgcolor: 'transparent', color: '#000' }
                            }}
                          >
                            {countdown > 0 ? `${countdown}s` : (sendResetCodeMutation.isPending ? '正在发送...' : '获取验证码')}
                          </Button>
                        }
                      />
                    </FormControl>
                    <FormControl required>
                      <FormLabel sx={{ color: '#3f3c36', fontWeight: 700 }}>验证码</FormLabel>
                      <Input
                        placeholder='6 位数字'
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        sx={inputSx}
                      />
                    </FormControl>
                    <FormControl required>
                      <FormLabel sx={{ color: '#3f3c36', fontWeight: 700 }}>新密码</FormLabel>
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        placeholder='至少 6 位新密码'
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        sx={inputSx}
                        endDecorator={
                          <IconButton variant='plain' onClick={() => setShowPassword(!showPassword)} sx={{ color: '#8b8579' }}>
                            {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                          </IconButton>
                        }
                      />
                    </FormControl>
                  </>
                ) : isLogin ? (
                  <>
                    <FormControl required>
                      <FormLabel sx={{ color: '#3f3c36', fontWeight: 700 }}>邮箱 / 用户名</FormLabel>
                      <Input placeholder='输入邮箱或用户名' value={identifier} onChange={(e) => setIdentifier(e.target.value)} sx={inputSx} />
                    </FormControl>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <FormLabel sx={{ color: '#3f3c36', fontWeight: 700 }}>密码</FormLabel>
                      <Link
                        component="button"
                        type="button"
                        onClick={() => { setIsForgotPassword(true); setError(null); setCountdown(0); setCode(''); }}
                        sx={{ fontSize: '12px', fontWeight: 600 }}
                      >
                        忘记密码？
                      </Link>
                    </Box>
                    <FormControl required>
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        placeholder='请输入密码'
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        sx={inputSx}
                        endDecorator={
                          <IconButton variant='plain' onClick={() => setShowPassword(!showPassword)} sx={{ color: '#8b8579' }}>
                            {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                          </IconButton>
                        }
                      />
                    </FormControl>
                  </>
                ) : (
                  <>
                    <FormControl required>
                      <FormLabel sx={{ color: '#3f3c36', fontWeight: 700 }}>显示昵称</FormLabel>
                      <Input value={nickname} onChange={(e) => setNickname(e.target.value)} sx={inputSx} />
                    </FormControl>
                    <FormControl required>
                      <FormLabel sx={{ color: '#3f3c36', fontWeight: 700 }}>电子邮箱</FormLabel>
                      <Input
                        type='email'
                        placeholder='example@mail.com'
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        sx={inputSx}
                        endDecorator={
                          <Button
                            variant="plain"
                            disabled={countdown > 0 || sendCodeMutation.isPending}
                            onClick={handleSendCode}
                            sx={{
                              color: countdown > 0 ? '#999' : '#111',
                              fontWeight: 700,
                              fontSize: '13px',
                              minWidth: '100px',
                              '&:hover': { bgcolor: 'transparent', color: '#000' }
                            }}
                          >
                            {countdown > 0 ? `${countdown}s` : (sendCodeMutation.isPending ? '正在发送...' : '获取验证码')}
                          </Button>
                        }
                      />
                    </FormControl>
                    <FormControl required>
                      <FormLabel sx={{ color: '#3f3c36', fontWeight: 700 }}>验证码</FormLabel>
                      <Input
                        placeholder='6 位数字'
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        sx={inputSx}
                      />
                    </FormControl>
                    <FormControl>
                      <FormLabel sx={{ color: '#3f3c36', fontWeight: 700 }}>登录用户名(选填)</FormLabel>
                      <Input value={username} onChange={(e) => setUsername(e.target.value.toLowerCase())} sx={inputSx} />
                    </FormControl>
                    <FormControl required>
                      <FormLabel sx={{ color: '#3f3c36', fontWeight: 700 }}>密码</FormLabel>
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        sx={inputSx}
                        endDecorator={
                          <IconButton variant='plain' onClick={() => setShowPassword(!showPassword)} sx={{ color: '#8b8579' }}>
                            {showPassword ? <VisibilityOffIcon /> : <VisibilityIcon />}
                          </IconButton>
                        }
                      />
                    </FormControl>
                    <FormControl>
                      <FormLabel sx={{ color: '#3f3c36', fontWeight: 700 }}>邀请码 (可选)</FormLabel>
                      <Input value={invitationCode} onChange={(e) => setInvitationCode(e.target.value.toUpperCase())} sx={inputSx} />
                    </FormControl>
                  </>
                )}

                <Button
                  type='submit'
                  loading={loginMutation.isPending || registerMutation.isPending || resetPasswordMutation.isPending}
                  sx={{ mt: 0.8, py: 1.15, borderRadius: '12px', fontWeight: 800, bgcolor: '#0b0e14', color: '#f2efe8', letterSpacing: '0.06em', '&:hover': { bgcolor: '#000' } }}
                >
                  {isForgotPassword ? '重置密码' : (isLogin ? '立即登录' : '立即注册')}
                </Button>
              </Stack>
            </form>

            <Box sx={{ mt: 1.7, textAlign: 'center' }}>
              <Typography level='body-sm' sx={{ color: '#5d5952' }}>
                {isForgotPassword ? (
                  <Link component='button' onClick={() => { setIsForgotPassword(false); setIsLogin(true); setError(null); }} sx={{ fontWeight: 700 }}>
                    返回登录
                  </Link>
                ) : (
                  <>
                    {isLogin ? '还没有账号？' : '已有账号？'}{' '}
                    <Link component='button' onClick={() => { setIsLogin(!isLogin); setError(null); }} sx={{ fontWeight: 700 }}>
                      {isLogin ? '创建一个新账号' : '立即返回登录'}
                    </Link>
                  </>
                )}
              </Typography>
            </Box>
          </Box>
        </ModalDialog>
      </Modal>

      <style jsx global>{`
        .MuiModal-backdrop {
          backdrop-filter: blur(8px);
          background: rgba(25, 23, 20, 0.22);
        }
      `}</style>
    </Box>
  );
};
