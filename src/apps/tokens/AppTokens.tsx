import * as React from 'react';
import { Box, Button, Card, Chip, Divider, Grid, Input, Stack, Typography } from '@mui/joy';
import SavingsIcon from '@mui/icons-material/Savings';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
import HistoryIcon from '@mui/icons-material/History';
import QrCode2Icon from '@mui/icons-material/QrCode2';
import RedeemIcon from '@mui/icons-material/Redeem';
import { useRouter } from 'next/router';

import { AppSmallContainer } from '../AppSmallContainer';
import { apiQuery } from '~/common/util/trpc.client';
import { useAuthStore } from '~/common/stores/auth/useAuthStore';

type PayChannel = 'ALIPAY' | 'WECHAT';

type RechargeOption = {
  id: string;
  amountYuan: number;
  coinAmount: number;
  label: string;
  expiresInDays?: number | null;
  isActive?: boolean;
  sortOrder?: number;
  popular?: boolean;
};

const COIN_ICON = '\u{1FA99}';
const LAST_PENDING_ORDER_KEY = 'last_pending_order_no';
const LAST_PAYMENT_INTENT_AT_KEY = 'last_payment_intent_at';
const LAST_SETTLED_ORDER_KEY = 'last_settled_order_no';
const PAYMENT_WATCH_WINDOW_MS = 15 * 60 * 1000;

const FALLBACK_RECHARGE_OPTIONS: RechargeOption[] = [
  { id: 'starter_1', amountYuan: 1, coinAmount: 30, label: 'Starter Pack', expiresInDays: null },
  { id: 'basic_10', amountYuan: 10, coinAmount: 300, label: 'Basic Pack', popular: true, expiresInDays: null },
  { id: 'hot_30', amountYuan: 30, coinAmount: 900, label: 'Hot Pack', expiresInDays: null },
  { id: 'plus_50', amountYuan: 50, coinAmount: 1600, label: 'Plus Pack', expiresInDays: null },
  { id: 'pro_100', amountYuan: 100, coinAmount: 3500, label: 'Pro Pack', expiresInDays: null },
  { id: 'ultra_200', amountYuan: 200, coinAmount: 7500, label: 'Ultra Pack', expiresInDays: null },
];

function pickFirstQueryValue(value: string | string[] | undefined): string | null {
  if (!value) return null;
  if (Array.isArray(value)) return value[0] || null;
  return value;
}

export function AppTokens() {
  const { user, accessToken } = useAuthStore();
  const router = useRouter();
  const utils = apiQuery.useUtils();

  const [selectedChannel, setSelectedChannel] = React.useState<PayChannel>('WECHAT');
  const [pendingOrderNo, setPendingOrderNo] = React.useState<string | null>(null);
  const [payHint, setPayHint] = React.useState<string | null>(null);
  const [redeemCodeInput, setRedeemCodeInput] = React.useState('');
  const [redeemHint, setRedeemHint] = React.useState<string | null>(null);
  const [watchRecentPayment, setWatchRecentPayment] = React.useState(false);
  const handledPaidOrderRef = React.useRef<string | null>(null);

  const { data: coinData, refetch: refetchBalance } = apiQuery.coin.getBalance.useQuery(undefined, {
    enabled: !!accessToken,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const { data: packageData, error: packageError } = apiQuery.payment.getRechargePackages.useQuery(undefined, {
    enabled: !!accessToken,
  });

  React.useEffect(() => {
    if (!router.isReady || pendingOrderNo) return;

    const fromQuery = pickFirstQueryValue(router.query.orderNo)
      || pickFirstQueryValue(router.query.out_trade_no)
      || pickFirstQueryValue(router.query.trade_order_id);

    if (fromQuery) {
      if (typeof window !== 'undefined') {
        const settledOrderNo = localStorage.getItem(LAST_SETTLED_ORDER_KEY);
        if (settledOrderNo === fromQuery) {
          localStorage.removeItem(LAST_PENDING_ORDER_KEY);
          localStorage.removeItem(LAST_PAYMENT_INTENT_AT_KEY);
          if (router.asPath.includes('?'))
            void router.replace('/tokens', undefined, { shallow: true });
          return;
        }
      }
      setPendingOrderNo(fromQuery);
      setWatchRecentPayment(true);
      setPayHint('检测到回跳订单，正在确认支付状态...');
      if (typeof window !== 'undefined') {
        localStorage.setItem(LAST_PENDING_ORDER_KEY, fromQuery);
        if (router.asPath.includes('?'))
          void router.replace('/tokens', undefined, { shallow: true });
      }
      return;
    }

    if (typeof window !== 'undefined') {
      const lastPending = localStorage.getItem(LAST_PENDING_ORDER_KEY);
      if (lastPending) {
        setPendingOrderNo(lastPending);
        setWatchRecentPayment(true);
        setPayHint('正在确认最近订单支付状态...');
      }

      const intentAtRaw = localStorage.getItem(LAST_PAYMENT_INTENT_AT_KEY);
      const intentAt = intentAtRaw ? Number(intentAtRaw) : 0;
      if (intentAt > 0 && (Date.now() - intentAt) <= PAYMENT_WATCH_WINDOW_MS)
        setWatchRecentPayment(true);
    }
  }, [router.isReady, router.query.orderNo, router.query.out_trade_no, router.query.trade_order_id, pendingOrderNo]);

  const orderStatusQuery = apiQuery.payment.getOrderStatus.useQuery(
    { orderNo: pendingOrderNo || '' },
    {
      enabled: !!accessToken && !!pendingOrderNo,
      staleTime: 0,
      refetchOnMount: 'always',
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchInterval: (query) => {
        const status = query.state.data?.status;
        if (!status || status === 'PENDING') return 2000;
        return false;
      },
    },
  );

  const latestOrderQuery = apiQuery.payment.getLatestOrder.useQuery(undefined, {
    enabled: !!accessToken && watchRecentPayment,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchInterval: (query) => {
      if (!watchRecentPayment) return false;
      const status = query.state.data?.status;
      if (!status || status === 'PENDING') return 2000;
      return false;
    },
  });

  const finalizePaidOrder = React.useCallback((orderNo: string, currentBalance?: number | null) => {
    if (!orderNo || handledPaidOrderRef.current === orderNo)
      return;

    handledPaidOrderRef.current = orderNo;
    if (typeof currentBalance === 'number')
      utils.coin.getBalance.setData(undefined, { balance: currentBalance });
    setPendingOrderNo(null);
    setWatchRecentPayment(false);
    setPayHint('支付已确认，金币已到账。');
    void refetchBalance();

    if (typeof window !== 'undefined') {
      localStorage.removeItem(LAST_PENDING_ORDER_KEY);
      localStorage.removeItem(LAST_PAYMENT_INTENT_AT_KEY);
      localStorage.setItem(LAST_SETTLED_ORDER_KEY, orderNo);
    }

    if (router.isReady && (router.query.orderNo || router.query.out_trade_no || router.query.trade_order_id))
      void router.replace('/tokens', undefined, { shallow: true });
  }, [
    refetchBalance,
    router,
    router.isReady,
    router.query.orderNo,
    router.query.out_trade_no,
    router.query.trade_order_id,
    utils.coin.getBalance,
  ]);

  React.useEffect(() => {
    if (!accessToken) return;
    const refreshAll = () => {
      void refetchBalance();
      if (pendingOrderNo)
        void orderStatusQuery.refetch();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible')
        refreshAll();
    };
    const onPageShow = () => {
      refreshAll();
    };
    window.addEventListener('focus', refreshAll);
    window.addEventListener('pageshow', onPageShow);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', refreshAll);
      window.removeEventListener('pageshow', onPageShow);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [accessToken, pendingOrderNo, refetchBalance, orderStatusQuery]);

  React.useEffect(() => {
    if (!accessToken || !watchRecentPayment) return;
    // Keep balance hot while an order is pending to avoid requiring manual refresh.
    const timer = setInterval(() => {
      void refetchBalance();
    }, 2000);
    return () => clearInterval(timer);
  }, [accessToken, watchRecentPayment, refetchBalance]);

  React.useEffect(() => {
    if (!accessToken) return;
    // Safety net: always refresh balance periodically on tokens page.
    // This guarantees coin amount updates after async payment notify, even if order tracking misses.
    const timer = setInterval(() => {
      void refetchBalance();
    }, 4000);
    return () => clearInterval(timer);
  }, [accessToken, refetchBalance]);

  React.useEffect(() => {
    if (!watchRecentPayment || !latestOrderQuery.data) return;

    const latest = latestOrderQuery.data;
    if (latest.status === 'PENDING') {
      if (!pendingOrderNo || pendingOrderNo !== latest.orderNo) {
        setPendingOrderNo(latest.orderNo);
        setPayHint('订单已创建，正在确认支付状态...');
        if (typeof window !== 'undefined')
          localStorage.setItem(LAST_PENDING_ORDER_KEY, latest.orderNo);
      }
      return;
    }

    if (latest.status === 'PAID') {
      finalizePaidOrder(latest.orderNo, latest.currentBalance);
    }
  }, [watchRecentPayment, latestOrderQuery.data, pendingOrderNo, finalizePaidOrder]);

  const paidOrderNo = orderStatusQuery.data?.status === 'PAID'
    ? orderStatusQuery.data.orderNo
    : null;

  React.useEffect(() => {
    if (!paidOrderNo) return;
    finalizePaidOrder(paidOrderNo, orderStatusQuery.data?.currentBalance);
  }, [paidOrderNo, orderStatusQuery.data?.currentBalance, finalizePaidOrder]);

  const createOrderMutation = apiQuery.payment.createOrder.useMutation({
    onSuccess: (res) => {
      setPendingOrderNo(res.orderNo);
      setWatchRecentPayment(true);
      setPayHint(res.message || null);
      if (typeof window !== 'undefined') {
        localStorage.setItem(LAST_PENDING_ORDER_KEY, res.orderNo);
        localStorage.setItem(LAST_PAYMENT_INTENT_AT_KEY, String(Date.now()));
      }
      if (res.payUrl)
        window.location.assign(res.payUrl);
    },
  });

  const redeemCodeMutation = apiQuery.coin.redeemCode.useMutation({
    onSuccess: (res) => {
      setRedeemHint(`兑换成功：+${res.coinAmount} 金币`);
      setRedeemCodeInput('');
      utils.coin.getBalance.setData(undefined, { balance: res.newBalance });
      void refetchBalance();
    },
    onError: (err: any) => {
      setRedeemHint(err?.message || '兑换失败');
    },
  });

  const rechargeOptions: RechargeOption[] = packageData?.items?.length
    ? packageData.items
    : FALLBACK_RECHARGE_OPTIONS;

  const handleCreateOrder = (packageId: string) => {
    createOrderMutation.mutate({
      packageId,
      channel: selectedChannel,
    });
  };

  return (
    <AppSmallContainer
      title='金币中心'
      description='查看余额并通过微信支付购买金币'
    >
      <Card variant='soft' color='primary' invertedColors sx={{ mb: 4, p: 3, boxShadow: 'md' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Box>
            <Typography level='body-md'>当前余额</Typography>
            <Typography level='h2' sx={{ fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 1 }}>
              <SavingsIcon sx={{ fontSize: '2.2rem' }} />
              {coinData?.balance ?? 0}
              <Box component='span' sx={{ opacity: 0.8, fontSize: '1.125rem', lineHeight: 1 }} aria-label='coin'>
                {COIN_ICON}
              </Box>
            </Typography>
          </Box>
          <Box sx={{ textAlign: 'right' }}>
            <Typography level='body-xs'>账户</Typography>
            <Chip color='success' variant='solid' size='sm'>
              {user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN' ? '管理员' : '用户'}
            </Chip>
          </Box>
        </Box>
      </Card>

      <Stack direction='row' spacing={1} sx={{ mb: 2 }}>
        <Button
          size='sm'
          variant={selectedChannel === 'WECHAT' ? 'solid' : 'soft'}
          color={selectedChannel === 'WECHAT' ? 'primary' : 'neutral'}
          startDecorator={<QrCode2Icon />}
          onClick={() => setSelectedChannel('WECHAT')}
        >
          微信支付
        </Button>
      </Stack>

      <Typography level='title-lg' sx={{ mb: 2, display: 'flex', alignItems: 'center', gap: 1 }}>
        <AddCircleOutlineIcon color='primary' /> 充值套餐
      </Typography>

      {packageError && (
        <Card variant='soft' color='warning' sx={{ mb: 2 }}>
          <Typography level='body-sm'>
            服务器套餐配置加载失败，已显示默认套餐。
          </Typography>
        </Card>
      )}

      <Grid container spacing={2} sx={{ mb: 4 }}>
        {rechargeOptions.map((opt) => (
          <Grid key={opt.id} xs={12} sm={6} md={4}>
            <Card
              variant={opt.popular ? 'solid' : 'outlined'}
              color={opt.popular ? 'primary' : 'neutral'}
              sx={{
                textAlign: 'center',
                cursor: 'pointer',
                transition: 'transform 0.2s',
                '&:hover': { transform: 'translateY(-4px)', boxShadow: 'md' },
              }}
              onClick={() => handleCreateOrder(opt.id)}
            >
              {opt.popular && (
                <Chip size='sm' color='warning' sx={{ position: 'absolute', top: -10, right: 10 }}>
                  推荐
                </Chip>
              )}

              <Typography level='title-md'>{opt.label}</Typography>
              <Typography level='h3' sx={{ my: 1 }}>
                {opt.coinAmount}
                <Box component='span' sx={{ ml: 0.5, fontSize: '0.85rem', lineHeight: 1 }} aria-label='coin'>
                  {COIN_ICON}
                </Box>
              </Typography>

              <Divider sx={{ my: 1 }} />

              <Typography level='body-sm' sx={{ mb: 0.5 }}>
                价格：¥{opt.amountYuan}
              </Typography>
              <Typography level='body-xs' sx={{ opacity: 0.75 }}>
                有效期：{opt.expiresInDays ? `${opt.expiresInDays} 天` : '不限时'}
              </Typography>

              <Button
                size='sm'
                fullWidth
                variant={opt.popular ? 'soft' : 'solid'}
                loading={createOrderMutation.isPending}
                sx={{ mt: 1 }}
              >
                立即下单
              </Button>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Card variant='outlined' sx={{ mb: 2 }}>
        <Box sx={{ p: 2 }}>
          <Typography level='title-sm' sx={{ mb: 1.5, display: 'flex', alignItems: 'center', gap: 1 }}>
            <RedeemIcon fontSize='small' /> 兑换码兑换
          </Typography>
          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
            <Input
              value={redeemCodeInput}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRedeemCodeInput(e.target.value.toUpperCase())}
              placeholder='输入兑换码'
            />
            <Button
              onClick={() => redeemCodeMutation.mutate({ code: redeemCodeInput.trim() })}
              loading={redeemCodeMutation.isPending}
              disabled={!redeemCodeInput.trim()}
            >
              立即兑换
            </Button>
          </Stack>
          {redeemHint && (
            <Typography level='body-xs' sx={{ mt: 1, opacity: 0.85 }}>
              {redeemHint}
            </Typography>
          )}
        </Box>
      </Card>

      {payHint && (
        <Card variant='soft' color='warning' sx={{ mb: 2 }}>
          <Typography level='body-sm'>{payHint}</Typography>
          {pendingOrderNo && (
            <Typography level='body-xs' sx={{ mt: 0.5 }}>
              待确认订单：{pendingOrderNo}
            </Typography>
          )}
        </Card>
      )}

      <Box sx={{ mt: 4, textAlign: 'center' }}>
        <Button
          variant='plain'
          color='neutral'
          size='sm'
          startDecorator={<HistoryIcon />}
          onClick={() => router.push('/billing')}
        >
          查看消费记录
        </Button>
      </Box>
    </AppSmallContainer>
  );
}
