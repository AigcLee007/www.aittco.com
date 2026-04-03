import * as React from 'react';
import { 
  Box, Card, CardContent, Typography, Table, Button, Input, IconButton, 
  CircularProgress, Modal, ModalDialog, FormControl, FormLabel, Stack, Divider 
} from '@mui/joy';
import AddIcon from '@mui/icons-material/Add';
import DeleteIcon from '@mui/icons-material/Delete';
import RefreshIcon from '@mui/icons-material/Refresh';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import { apiQuery } from '~/common/util/trpc.client';

export function InvitationsSection() {
  const [isModalOpen, setIsModalOpen] = React.useState(false);
  const [newCode, setNewCode] = React.useState({ code: '', maxUses: 1 });

  const { data: codes, isLoading, refetch } = (apiQuery.admin.getInvitationCodes as any).useQuery();
  const createMutation = (apiQuery.admin.createInvitationCode as any).useMutation({ 
    onSuccess: () => {
      setIsModalOpen(false);
      refetch();
    }
  });
  const deleteMutation = (apiQuery.admin.deleteInvitationCode as any).useMutation({ onSuccess: () => refetch() });

  const handleCreate = () => {
    if (!newCode.code) return;
    createMutation.mutate(newCode);
  };

  const generateRandomCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < 8; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setNewCode({ ...newCode, code: result });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('邀请码已复制: ' + text);
  };

  return (
    <Card variant="outlined">
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Box>
            <Typography level="title-lg">邀请码管理系统</Typography>
            <Typography level="body-xs" sx={{ opacity: 0.7 }}>生成邀请码以限制注册或追踪推广来源</Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button startDecorator={<AddIcon />} onClick={() => {
                setIsModalOpen(true);
                generateRandomCode();
            }}>生成新码</Button>
            <IconButton variant="outlined" onClick={() => refetch()}><RefreshIcon /></IconButton>
          </Box>
        </Box>

        <Box sx={{ overflow: 'auto' }}>
          <Table stickyHeader hoverRow>
            <thead>
              <tr>
                <th>邀请码 (Code)</th>
                <th>使用情况 (Used/Max)</th>
                <th>创建时间</th>
                <th style={{ textAlign: 'right' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', padding: '40px' }}><CircularProgress /></td></tr>
              ) : (codes || []).length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', padding: '40px' }}>暂无邀请码记录</td></tr>
              ) : codes.map((c: any) => (
                <tr key={c.id}>
                  <td>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography level="body-md" fontWeight="bold" sx={{ color: 'primary.600', letterSpacing: 1 }}>{c.code}</Typography>
                      <IconButton size="sm" variant="plain" onClick={() => copyToClipboard(c.code)}><ContentCopyIcon sx={{ fontSize: 16 }} /></IconButton>
                    </Box>
                  </td>
                  <td>
                    <Typography level="body-sm">{c.usedCount} / {c.maxUses === 999999 ? '无限' : c.maxUses}</Typography>
                    <Box sx={{ width: '100%', height: 4, bgcolor: 'neutral.100', borderRadius: 2, mt: 0.5 }}>
                      <Box sx={{ width: `${(c.usedCount / c.maxUses) * 100}%`, height: '100%', bgcolor: 'primary.500', borderRadius: 2 }} />
                    </Box>
                  </td>
                  <td><Typography level="body-xs">{new Date(c.createdAt).toLocaleString()}</Typography></td>
                  <td style={{ textAlign: 'right' }}>
                    <IconButton 
                      size="sm" 
                      color="danger" 
                      variant="plain"
                      onClick={() => {
                        if (confirm('确定要删除此邀请码吗？')) {
                          deleteMutation.mutate({ id: c.id });
                        }
                      }}
                      loading={deleteMutation.isPending}
                    ><DeleteIcon /></IconButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Box>

        <Modal open={isModalOpen} onClose={() => setIsModalOpen(false)}>
          <ModalDialog sx={{ width: 400 }}>
            <Typography level="title-md">生成邀请码</Typography>
            <Divider sx={{ my: 1.5 }} />
            <Stack spacing={2}>
              <FormControl>
                <FormLabel>邀请码内容</FormLabel>
                <Box sx={{ display: 'flex', gap: 1 }}>
                  <Input 
                    value={newCode.code} 
                    onChange={(e) => setNewCode({ ...newCode, code: e.target.value.toUpperCase() })} 
                    sx={{ flexGrow: 1 }}
                  />
                  <Button variant="soft" onClick={generateRandomCode}>随机</Button>
                </Box>
              </FormControl>
              <FormControl>
                <FormLabel>可用次数 (输入 999999 代表无限次)</FormLabel>
                <Input 
                  type="number" 
                  value={newCode.maxUses} 
                  onChange={(e) => setNewCode({ ...newCode, maxUses: parseInt(e.target.value) })} 
                />
              </FormControl>
              <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 1 }}>
                <Button variant="plain" color="neutral" onClick={() => setIsModalOpen(false)}>取消</Button>
                <Button 
                  loading={createMutation.isPending}
                  onClick={handleCreate}
                >立即创建</Button>
              </Box>
            </Stack>
          </ModalDialog>
        </Modal>
      </CardContent>
    </Card>
  );
}
