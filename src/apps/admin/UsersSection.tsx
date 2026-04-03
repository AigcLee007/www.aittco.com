import * as React from 'react';
import { 
  Box, Card, CardContent, Typography, Table, Button, Input, Select, Option, 
  Chip, CircularProgress, Tooltip, IconButton, Avatar, Modal, ModalDialog, 
  FormControl, FormLabel, Stack, Divider, Textarea
} from '@mui/joy';
import SearchIcon from '@mui/icons-material/Search';
import RefreshIcon from '@mui/icons-material/Refresh';
import EditIcon from '@mui/icons-material/Edit';
import BlockIcon from '@mui/icons-material/Block';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import KeyIcon from '@mui/icons-material/Key';
import PaidIcon from '@mui/icons-material/Paid';
import InfoIcon from '@mui/icons-material/Info';
import { apiQuery } from '~/common/util/trpc.client';
import { useAuthStore } from '~/common/stores/auth/useAuthStore';

interface User {
  id: string;
  shortId?: number;
  username?: string;
  email: string;
  nickname: string;
  avatar?: string;
  coinBalance: number;
  role: 'USER' | 'ADMIN' | 'SUPER_ADMIN';
  isActive: boolean;
  lastLoginAt?: string;
  lastLoginIP?: string;
  adminNotes?: string;
  tags?: string;
  createdAt: string;
}

export function UsersSection() {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [roleFilter, setRoleFilter] = React.useState<string | null>(null);
  
  const currentUser = useAuthStore(state => state.user);
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';

  // 各种 Modal 状态
  const [balanceModal, setBalanceModal] = React.useState<{ open: boolean, userId: string, nickname: string }>({ open: false, userId: '', nickname: '' });
  const [balanceAmount, setBalanceAmount] = React.useState(0);
  const [balanceDesc, setBalanceDesc] = React.useState('管理员手动调整');
  
  const [notesModal, setNotesModal] = React.useState<{ open: boolean, userId: string, notes: string, tags: string }>({ open: false, userId: '', notes: '', tags: '' });

  const { data: usersData, isLoading, refetch } = (apiQuery.admin.getAllUsers as any).useQuery({ limit: 50, offset: 0 });
  const users: User[] = usersData?.users || [];

  const updateStatusMutation = (apiQuery.admin.updateUserStatus as any).useMutation({ onSuccess: () => refetch() });
  const updateRoleMutation = (apiQuery.admin.updateUserRole as any).useMutation({ onSuccess: () => refetch() });
  const resetPasswordMutation = (apiQuery.admin.resetUserPassword as any).useMutation({ 
    onSuccess: () => {
      alert('密码已重置为: 123456');
      refetch();
    }
  });
  const updateBalanceMutation = (apiQuery.admin.updateUserBalance as any).useMutation({ 
    onSuccess: () => {
      setBalanceModal({ ...balanceModal, open: false });
      refetch();
    }
  });
  const updateAdminFieldsMutation = (apiQuery.admin.updateUserAdminFields as any).useMutation({ 
    onSuccess: () => {
      setNotesModal({ ...notesModal, open: false });
      refetch();
    }
  });

  const filteredUsers = users.filter((u: User) => 
    (
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) || 
      u.nickname.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.shortId?.toString().includes(searchTerm)
    ) &&
    (!roleFilter || u.role === roleFilter)
  );

  return (
    <Card variant="outlined">
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography level="title-lg">用户精细化管理 {!isSuperAdmin && <Chip size="sm" color="warning" variant="soft">限制模式</Chip>}</Typography>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Input 
              startDecorator={<SearchIcon />} 
              placeholder="搜索 ID/昵称/邮箱/用户名" 
              size="sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              sx={{ width: 300 }}
            />
            <Select 
              size="sm"
              placeholder="按角色筛选" 
              value={roleFilter} 
              onChange={(_, v) => setRoleFilter(v)}
              sx={{ width: 150 }}
            >
              <Option value={null}>全部角色</Option>
              <Option value="USER">普通用户</Option>
              <Option value="ADMIN">管理员</Option>
              <Option value="SUPER_ADMIN">超级管理员</Option>
            </Select>
            <IconButton variant="outlined" size="sm" onClick={() => refetch()}>
              <RefreshIcon />
            </IconButton>
          </Box>
        </Box>

        <Box sx={{ overflow: 'auto' }}>
          <Table stickyHeader hoverRow sx={{ '& tr > *': { verticalAlign: 'middle' } }}>
            <thead>
              <tr>
                <th style={{ width: 100 }}>用户 ID</th>
                <th>基本信息</th>
                <th>账户与标签</th>
                <th>角色</th>
                <th>状态/审计</th>
                <th style={{ width: 220, textAlign: 'right' }}>快捷操作</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '40px' }}><CircularProgress /></td></tr>
              ) : filteredUsers.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: '40px' }}>未找到匹配的用户</td></tr>
              ) : filteredUsers.map((u: User) => (
                <tr key={u.id}>
                  <td>
                    <Typography level="body-xs" fontWeight="bold" sx={{ fontFamily: 'monospace', color: 'primary.plainColor' }}>
                      #{u.shortId || '---'}
                    </Typography>
                  </td>
                  <td>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                      <Avatar size="sm" src={u.avatar}>{u.nickname.charAt(0)}</Avatar>
                      <Box>
                        <Stack direction="row" spacing={0.5} alignItems="center">
                          <Typography level="body-sm" fontWeight="bold">{u.nickname}</Typography>
                          {u.username && <Typography level="body-xs" sx={{ opacity: 0.5 }}>@{u.username}</Typography>}
                        </Stack>
                        <Typography level="body-xs" sx={{ opacity: 0.7 }}>{u.email}</Typography>
                      </Box>
                    </Box>
                  </td>
                  <td>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
                      <Typography level="body-sm" fontWeight="bold" color="primary">🪙 {u.coinBalance}</Typography>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {u.tags ? u.tags.split(',').map(tag => (
                          <Chip key={tag} size="sm" variant="soft" color="neutral">{tag}</Chip>
                        )) : <Typography level="body-xs" sx={{ fontStyle: 'italic', opacity: 0.5 }}>暂无标签</Typography>}
                      </Box>
                    </Box>
                  </td>
                  <td>
                    <Chip size="sm" variant="soft" color={u.role === 'SUPER_ADMIN' ? 'danger' : u.role === 'ADMIN' ? 'warning' : 'neutral'}>
                      {u.role}
                    </Chip>
                  </td>
                  <td>
                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.2 }}>
                      <Chip size="sm" variant="solid" color={u.isActive ? 'success' : 'neutral'} sx={{ width: 'fit-content' }}>
                        {u.isActive ? '正常' : '封禁'}
                      </Chip>
                      <Typography level="body-xs" sx={{ mt: 0.5 }}>IP: {u.lastLoginIP || '从未登录'}</Typography>
                      <Typography level="body-xs">最后活跃: {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : '无'}</Typography>
                    </Box>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                      <Tooltip title={isSuperAdmin ? "调整金币" : "权限不足"} size="sm">
                        <span>
                          <IconButton 
                            size="sm" 
                            color="success" 
                            disabled={!isSuperAdmin}
                            onClick={() => {
                              setBalanceModal({ open: true, userId: u.id, nickname: u.nickname });
                              setBalanceAmount(0);
                            }}><PaidIcon /></IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title="备注与标签" size="sm">
                        <IconButton size="sm" color="primary" onClick={() => {
                          setNotesModal({ open: true, userId: u.id, notes: u.adminNotes || '', tags: u.tags || '' });
                        }}><InfoIcon /></IconButton>
                      </Tooltip>
                      <Tooltip title={isSuperAdmin ? "重置密码 (123456)" : "权限不足"} size="sm">
                        <span>
                          <IconButton 
                            size="sm" 
                            color="warning" 
                            disabled={!isSuperAdmin}
                            onClick={() => {
                              if (confirm(`确定要将用户 ${u.nickname} 的密码重置为 123456 吗？`)) {
                                resetPasswordMutation.mutate({ userId: u.id });
                              }
                            }}><KeyIcon /></IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title={!isSuperAdmin ? "权限不足" : (u.isActive ? "禁用用户" : "启用用户")} size="sm">
                        <span>
                          <IconButton 
                            size="sm" 
                            color={u.isActive ? "danger" : "success"}
                            disabled={!isSuperAdmin || u.id === currentUser?.id}
                            onClick={() => updateStatusMutation.mutate({ userId: u.id, isActive: !u.isActive })}
                            loading={updateStatusMutation.isPending}
                          >
                            {u.isActive ? <BlockIcon /> : <CheckCircleIcon />}
                          </IconButton>
                        </span>
                      </Tooltip>
                      <Tooltip title={isSuperAdmin ? "切换角色" : "权限不足"} size="sm">
                        <span>
                          <IconButton 
                            size="sm" 
                            color="neutral"
                            disabled={!isSuperAdmin || u.id === currentUser?.id}
                            onClick={() => {
                              const roles: User['role'][] = ['USER', 'ADMIN', 'SUPER_ADMIN'];
                              const currentIndex = roles.indexOf(u.role);
                              const nextRole = roles[(currentIndex + 1) % roles.length];
                              if (confirm(`确定要将 ${u.nickname} 切换为 ${nextRole} 吗？`)) {
                                updateRoleMutation.mutate({ userId: u.id, role: nextRole });
                              }
                            }}
                          ><EditIcon /></IconButton>
                        </span>
                      </Tooltip>
                    </Box>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Box>

        {/* 金币调整 Modal */}
        <Modal open={balanceModal.open} onClose={() => setBalanceModal({ ...balanceModal, open: false })}>
          <ModalDialog sx={{ width: 400 }}>
            <Typography level="title-md">为用户「{balanceModal.nickname}」调整金币</Typography>
            <Divider sx={{ my: 1.5 }} />
            <Stack spacing={2}>
              <FormControl>
                <FormLabel>数量 (正数为增加，负数为扣除)</FormLabel>
                <Input 
                  type="number" 
                  value={balanceAmount} 
                  onChange={(e) => setBalanceAmount(parseInt(e.target.value))}
                  endDecorator="🪙"
                />
              </FormControl>
              <FormControl>
                <FormLabel>调整原因</FormLabel>
                <Input value={balanceDesc} onChange={(e) => setBalanceDesc(e.target.value)} />
              </FormControl>
              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 1 }}>
                <Button variant="plain" color="neutral" onClick={() => setBalanceModal({ ...balanceModal, open: false })}>取消</Button>
                <Button 
                  loading={updateBalanceMutation.isPending}
                  onClick={() => updateBalanceMutation.mutate({ userId: balanceModal.userId, amount: balanceAmount, description: balanceDesc })}
                >确认调整</Button>
              </Box>
            </Stack>
          </ModalDialog>
        </Modal>

        {/* 备注与标签 Modal */}
        <Modal open={notesModal.open} onClose={() => setNotesModal({ ...notesModal, open: false })}>
          <ModalDialog sx={{ width: 500 }}>
            <Typography level="title-md">用户备注与运维标签</Typography>
            <Divider sx={{ my: 1.5 }} />
            <Stack spacing={2}>
              <FormControl>
                <FormLabel>用户标签 (以逗号分隔，如: VIP, 测试员)</FormLabel>
                <Input value={notesModal.tags} onChange={(e) => setNotesModal({ ...notesModal, tags: e.target.value })} />
              </FormControl>
              <FormControl>
                <FormLabel>管理员后台备注</FormLabel>
                <Textarea 
                  minRows={3} 
                  value={notesModal.notes} 
                  onChange={(e) => setNotesModal({ ...notesModal, notes: e.target.value })} 
                  placeholder="仅管理员可见..."
                />
              </FormControl>
              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 1 }}>
                <Button variant="plain" color="neutral" onClick={() => setNotesModal({ ...notesModal, open: false })}>取消</Button>
                <Button 
                  loading={updateAdminFieldsMutation.isPending}
                  onClick={() => updateAdminFieldsMutation.mutate({ userId: notesModal.userId, adminNotes: notesModal.notes, tags: notesModal.tags })}
                >保存信息</Button>
              </Box>
            </Stack>
          </ModalDialog>
        </Modal>

      </CardContent>
    </Card>
  );
}
