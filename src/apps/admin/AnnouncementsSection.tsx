import * as React from 'react';
import { Box, Card, CardContent, Typography, Button, Input, Select, Option, Stack, FormControl, FormLabel, Textarea, Checkbox, CircularProgress, IconButton, Grid, Chip } from '@mui/joy';
import DeleteIcon from '@mui/icons-material/Delete';
import AddIcon from '@mui/icons-material/Add';
import RefreshIcon from '@mui/icons-material/Refresh';
import { apiQuery } from '~/common/util/trpc.client';

export function AnnouncementsSection() {
  const { data: announcements, isLoading, refetch } = (apiQuery.admin.getAnnouncements as any).useQuery();
  const [newAnn, setNewAnn] = React.useState({ title: '', content: '', type: 'info', isActive: true });

  const createMutation = (apiQuery.admin.createAnnouncement as any).useMutation({
    onSuccess: () => {
      refetch();
      setNewAnn({ title: '', content: '', type: 'info', isActive: true });
    }
  });

  const deleteMutation = (apiQuery.admin.deleteAnnouncement as any).useMutation({
    onSuccess: () => refetch()
  });

  return (
    <Grid container spacing={2}>
      <Grid xs={12} md={4}>
        <Card variant="outlined">
          <CardContent>
            <Typography level="title-md" sx={{ mb: 2 }}>发布新公告</Typography>
            <Stack spacing={2}>
              <FormControl>
                <FormLabel>标题</FormLabel>
                <Input 
                  value={newAnn.title} 
                  onChange={(e: any) => setNewAnn({ ...newAnn, title: e.target.value })} 
                  placeholder="公告标题"
                />
              </FormControl>
              <FormControl>
                <FormLabel>内容 (支持简单的文本)</FormLabel>
                <Textarea 
                  minRows={3} 
                  value={newAnn.content} 
                  onChange={(e: any) => setNewAnn({ ...newAnn, content: e.target.value })} 
                  placeholder="公告详细内容..."
                />
              </FormControl>
              <FormControl>
                <FormLabel>类型</FormLabel>
                <Select value={newAnn.type} onChange={(_: any, v: any) => setNewAnn({ ...newAnn, type: v as string })}>
                  <Option value="info">常规 (Blue)</Option>
                  <Option value="success">成功 (Green)</Option>
                  <Option value="warning">提醒 (Yellow)</Option>
                  <Option value="danger">紧急 (Red)</Option>
                </Select>
              </FormControl>
              <Checkbox 
                label="立即发布并显示" 
                checked={newAnn.isActive} 
                onChange={(e: any) => setNewAnn({ ...newAnn, isActive: e.target.checked })} 
              />
              <Button 
                startDecorator={<AddIcon />} 
                onClick={() => createMutation.mutate(newAnn)}
                loading={createMutation.isPending}
                disabled={!newAnn.title || !newAnn.content}
              >
                立即发布
              </Button>
            </Stack>
          </CardContent>
        </Card>
      </Grid>

      <Grid xs={12} md={8}>
        <Card variant="outlined">
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
              <Typography level="title-md">现有公告列表</Typography>
              <IconButton size="sm" onClick={() => refetch()}><RefreshIcon /></IconButton>
            </Box>
            <Stack spacing={2}>
              {isLoading ? (
                <CircularProgress sx={{ mx: 'auto', my: 2 }} />
              ) : (announcements || []).map((a: any) => (
                <Card key={a.id} variant="soft" color={a.type as any} sx={{ position: 'relative' }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <Box>
                      <Typography level="title-sm" sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {a.title}
                        {!a.isActive && <Chip size="sm" variant="outlined">已隐藏</Chip>}
                      </Typography>
                      <Typography level="body-xs" sx={{ mt: 0.5 }}>{a.content}</Typography>
                      <Typography level="body-xs" sx={{ mt: 1, opacity: 0.6 }}>发布于: {new Date(a.createdAt).toLocaleString()}</Typography>
                    </Box>
                    <IconButton 
                      size="sm" 
                      color="danger" 
                      variant="plain"
                      onClick={() => deleteMutation.mutate({ id: a.id })}
                    >
                      <DeleteIcon />
                    </IconButton>
                  </Box>
                </Card>
              ))}
              {!isLoading && announcements?.length === 0 && <Typography sx={{ textAlign: 'center', opacity: 0.5, my: 4 }}>暂无公告</Typography>}
            </Stack>
          </CardContent>
        </Card>
      </Grid>
    </Grid>
  );
}
