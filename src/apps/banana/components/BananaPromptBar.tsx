'use client';

import * as React from 'react';
import {
  Box,
  Button,
  Dropdown,
  IconButton,
  Menu,
  MenuButton,
  MenuItem,
  Modal,
  ModalClose,
  ModalDialog,
  Textarea,
  Tooltip,
  Typography,
} from '@mui/joy';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import AddPhotoAlternateOutlinedIcon from '@mui/icons-material/AddPhotoAlternateOutlined';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import CloseRoundedIcon from '@mui/icons-material/CloseRounded';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import AutoFixHighRoundedIcon from '@mui/icons-material/AutoFixHighRounded';
import ContentCopyRoundedIcon from '@mui/icons-material/ContentCopyRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToHorizontalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { optimizeBananaPrompt, type BananaPromptOptimizationOption } from '../banana.api';

type UploadedImage = {
  id: string;
  data: string;
  name?: string;
};

type LineOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

interface BananaPromptBarProps {
  prompt: string;
  setPrompt: (p: string) => void;
  onGenerate: () => void;
  isGenerating: boolean;
  size: string;
  setSize: (s: string) => void;
  resolution: string;
  setResolution: (r: string) => void;
  batchSize: number;
  setBatchSize: (b: number) => void;
  duration?: number;
  setDuration?: (d: number) => void;
  hd?: boolean;
  setHd?: (v: boolean) => void;
  isVideoModel?: boolean;
  videoReferenceMode?: 'first-last' | 'multi' | null;
  maxVideoUploadCount?: number;
  line: string;
  setLine: (line: string) => void;
  showLineSelector?: boolean;
  lineOptions?: LineOption[];
  estimatedCoins?: number | null;
  uploadedImages: UploadedImage[];
  onFileUpload: (files: File[]) => void;
  onImageRemove: (id: string) => void;
  onImagesReorder: (newImages: UploadedImage[]) => void;
  isCollapsed: boolean;
  setIsCollapsed: (c: boolean) => void;
  model: string;
  onNotify?: (message: string) => void;
}

function getResolutionLabel(value: string): string {
  if (value === '4K')
    return '超高精细';
  if (value === '2K')
    return '高清';
  return '标准';
}

async function copyToClipboard(text: string) {
  if (!text)
    return;
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const helper = document.createElement('textarea');
  helper.value = text;
  helper.style.position = 'fixed';
  helper.style.opacity = '0';
  document.body.appendChild(helper);
  helper.focus();
  helper.select();
  document.execCommand('copy');
  document.body.removeChild(helper);
}

export function BananaPromptBar(props: BananaPromptBarProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = React.useState(false);

  const [isOptimizing, setIsOptimizing] = React.useState(false);
  const [optimizeError, setOptimizeError] = React.useState('');
  const [isOptimizeModalOpen, setIsOptimizeModalOpen] = React.useState(false);
  const [optimizeOptions, setOptimizeOptions] = React.useState<BananaPromptOptimizationOption[]>([]);
  const [copiedIndex, setCopiedIndex] = React.useState<number | null>(null);
  const [previewImage, setPreviewImage] = React.useState<string | null>(null);

  const isBanana2Family = props.model === 'gemini-3.1-flash-image-preview' || props.model === 'gemini-3.1-flash-image-preview-vip';
  const isVideoModel = Boolean(props.isVideoModel);
  const lineOptions = props.lineOptions || [];
  const getThumbTagLabel = React.useCallback((index: number) => {
    if (props.videoReferenceMode === 'first-last')
      return index === 0 ? '首帧' : '尾帧';
    return `图${index + 1}`;
  }, [props.videoReferenceMode]);

  const pillSx = {
    borderRadius: '2rem',
    fontWeight: 600,
    backgroundColor: 'background.surface',
    border: '1px solid',
    borderColor: 'divider',
    px: 1.5,
    boxShadow: 'none',
    transition: 'background-color 0.18s ease',
    '&:hover': {
      backgroundColor: 'neutral.softBg',
    },
  } as const;

  const handleFiles = React.useCallback((files: FileList | null) => {
    if (!files?.length)
      return;
    props.onFileUpload(Array.from(files));
  }, [props]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
    e.target.value = '';
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items?.length)
      return;

    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (!items[i].type.includes('image'))
        continue;
      const file = items[i].getAsFile();
      if (file)
        files.push(file);
    }
    if (files.length)
      props.onFileUpload(files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id)
      return;
    const oldIndex = props.uploadedImages.findIndex((img) => img.id === active.id);
    const newIndex = props.uploadedImages.findIndex((img) => img.id === over.id);
    if (oldIndex < 0 || newIndex < 0)
      return;
    props.onImagesReorder(arrayMove(props.uploadedImages, oldIndex, newIndex));
  };

  const handleOptimizePrompt = React.useCallback(async () => {
    const sourcePrompt = props.prompt.trim();
    if (!sourcePrompt || isOptimizing)
      return;

    setOptimizeError('');
    setCopiedIndex(null);
    setIsOptimizing(true);
    try {
      const options = await optimizeBananaPrompt(sourcePrompt);
      if (!options.length)
        throw new Error('未获取到可用的优化结果，请稍后重试。');
      setOptimizeOptions(options.slice(0, 3));
      setIsOptimizeModalOpen(true);
    } catch (error: any) {
      const message = error?.message || '提示词优化失败';
      setOptimizeError(message);
      props.onNotify?.(message);
    } finally {
      setIsOptimizing(false);
    }
  }, [isOptimizing, props.prompt, props.onNotify]);

  React.useEffect(() => {
    const onShortcut = () => {
      void handleOptimizePrompt();
    };
    window.addEventListener('banana-open-prompt-optimize', onShortcut as EventListener);
    return () => {
      window.removeEventListener('banana-open-prompt-optimize', onShortcut as EventListener);
    };
  }, [handleOptimizePrompt]);

  return (
    <>
      <Box
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        sx={{
          position: 'absolute',
          bottom: '15px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: props.isCollapsed ? 44 : 'calc(100% - 2rem)',
          minWidth: props.isCollapsed ? 44 : 320,
          maxWidth: props.isCollapsed ? 44 : 930,
          zIndex: 1000,
          transition: 'all 0.35s ease',
          opacity: 1,
          pointerEvents: props.isCollapsed ? 'none' : 'auto',
          ...(isDragging && !props.isCollapsed && {
            transform: 'translateX(-50%) scale(1.015)',
            '& .banana-prompt-panel': {
              borderColor: 'primary.main',
              boxShadow: '0 0 0 2px var(--joy-palette-primary-softBg)',
              backgroundColor: 'background.level1',
            },
          }),
        }}
      >
        <Box
          className='banana-prompt-panel'
          sx={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'background.popup',
            borderRadius: '2.4rem',
            boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
            border: '1px solid',
            borderColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.08)' : 'divider',
            p: 1.5,
            pt: 1,
            gap: 0.6,
            pb: 1.2,
            backdropFilter: 'blur(8px)',
            transform: props.isCollapsed ? 'translateY(calc(100% + 40px))' : 'translateY(0)',
            opacity: props.isCollapsed ? 0 : 1,
            pointerEvents: props.isCollapsed ? 'none' : 'auto',
            transition: 'transform 0.28s ease, opacity 0.2s ease',
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
            <Textarea
              variant='plain'
              minRows={1}
              maxRows={4}
              placeholder='描述你想生成的画面...'
              value={props.prompt}
              onChange={(e) => props.setPrompt(e.target.value)}
              onPaste={handlePaste}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  props.onGenerate();
                }
              }}
              sx={{
                flexGrow: 1,
                bgcolor: 'transparent',
                '--Textarea-focusedHighlight': 'transparent',
                '&::before': { display: 'none' },
                p: 1.5,
                fontSize: '1rem',
                fontWeight: 500,
              }}
            />
          </Box>

          {!!optimizeError && (
            <Typography level='body-xs' color='danger' sx={{ px: 1.5 }}>
              {optimizeError}
            </Typography>
          )}

          {props.uploadedImages.length > 0 && (
            <Box sx={{ display: 'flex', gap: 1.5, px: 1.5, py: 1, flexWrap: 'wrap' }}>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
                modifiers={[restrictToHorizontalAxis]}
              >
                <SortableContext
                  items={props.uploadedImages.map((img) => img.id)}
                  strategy={horizontalListSortingStrategy}
                >
                  {props.uploadedImages.map((img, index) => (
                    <SortableThumbnail
                      key={img.id}
                      img={img}
                      onRemove={() => props.onImageRemove(img.id)}
                      onPreview={() => setPreviewImage(img.data)}
                      tagLabel={getThumbTagLabel(index)}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </Box>
          )}

          <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 1, sm: 2.2 }, px: { xs: 0.5, sm: 1 }, pb: 0.4 }}>
            <input
              type='file'
              ref={fileInputRef}
              onChange={handleFileChange}
              accept='image/*'
              multiple
              style={{ display: 'none' }}
            />
            <Tooltip title='上传参考图（U）'>
              <IconButton
                size='sm'
                variant='plain'
                color='neutral'
                onClick={() => fileInputRef.current?.click()}
                sx={{ borderRadius: '50%' }}
              >
                <AddPhotoAlternateOutlinedIcon />
              </IconButton>
            </Tooltip>

            <Box sx={{ display: 'flex', gap: { xs: 0.5, sm: 1.2 }, alignItems: 'center' }}>
              <Box sx={{ display: { xs: 'none', sm: 'flex' }, gap: 1.2 }}>
                {props.showLineSelector && (
                  <Box
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      p: 0.4,
                      gap: 0.5,
                      borderRadius: '999px',
                      border: '1px solid',
                      borderColor: 'divider',
                      bgcolor: 'background.surface',
                    }}
                  >
                    {lineOptions.map((option) => {
                      const active = props.line === option.value;
                      return (
                        <Button
                          key={option.value}
                          size='sm'
                          variant={active ? 'soft' : 'plain'}
                          color={active ? 'primary' : 'neutral'}
                          disabled={option.disabled}
                          onClick={() => props.setLine(option.value)}
                          sx={{
                            borderRadius: '999px',
                            px: 1.4,
                            minHeight: 30,
                            fontWeight: 700,
                          }}
                        >
                          {option.label}
                        </Button>
                      );
                    })}
                  </Box>
                )}

                {!isVideoModel && (
                <Dropdown>
                  <MenuButton
                    slots={{ root: Button }}
                    slotProps={{
                      root: {
                        size: 'sm',
                        variant: 'plain',
                        color: 'neutral',
                        endDecorator: <KeyboardArrowDownIcon sx={{ fontSize: '0.9rem' }} />,
                      },
                    }}
                    sx={pillSx}
                  >
                    {props.resolution}
                  </MenuButton>
                  <Menu placement='top' sx={{ borderRadius: '1.1rem', boxShadow: 'lg', minWidth: 164 }}>
                    {(['1K', '2K', '4K'] as const).map((value) => (
                      <MenuItem key={value} onClick={() => props.setResolution(value)} sx={{ justifyContent: 'space-between', py: 1 }}>
                        <Typography level='title-sm'>{value}</Typography>
                        <Typography level='body-xs' sx={{ opacity: 0.58 }}>{getResolutionLabel(value)}</Typography>
                      </MenuItem>
                    ))}
                  </Menu>
                </Dropdown>
                )}

                <Dropdown>
                  <MenuButton
                    slots={{ root: Button }}
                    slotProps={{
                      root: {
                        size: 'sm',
                        variant: 'plain',
                        color: 'neutral',
                        startDecorator: (
                          <Box
                            sx={{
                              width: 14,
                              height: props.size === '16:9' ? 8 : props.size === '9:16' ? 18 : 14,
                              border: '1.5px solid currentColor',
                              borderRadius: props.size === '1:1' ? '3px' : '2px',
                            }}
                          />
                        ),
                        endDecorator: <KeyboardArrowDownIcon sx={{ fontSize: '0.9rem' }} />,
                      },
                    }}
                    sx={pillSx}
                  >
                    {props.size}
                  </MenuButton>
                  <Menu placement='top' sx={{ borderRadius: '1.1rem', boxShadow: 'lg', minWidth: 164 }}>
                    {(isVideoModel ? ['16:9', '9:16'] : (isBanana2Family ? ['1:1', '16:9', '9:16'] : ['1:1', '16:9', '9:16', '4:3', '3:4'])).map((aspect) => (
                      <MenuItem key={aspect} onClick={() => props.setSize(aspect)}>
                        {aspect}
                      </MenuItem>
                    ))}
                  </Menu>
                </Dropdown>

                {!isVideoModel && (
                <Dropdown>
                  <MenuButton
                    slots={{ root: Button }}
                    slotProps={{
                      root: {
                        size: 'sm',
                        variant: 'plain',
                        color: 'neutral',
                        startDecorator: <LayersOutlinedIcon sx={{ fontSize: '0.95rem' }} />,
                        endDecorator: <KeyboardArrowDownIcon sx={{ fontSize: '0.9rem' }} />,
                      },
                    }}
                    sx={pillSx}
                  >
                    {props.batchSize}张
                  </MenuButton>
                  <Menu placement='top' sx={{ borderRadius: '1.1rem', boxShadow: 'lg', minWidth: 132 }}>
                    {[1, 2, 3, 4].map((count) => (
                      <MenuItem key={count} onClick={() => props.setBatchSize(count)}>
                        {count}张
                      </MenuItem>
                    ))}
                  </Menu>
                </Dropdown>
                )}

                {isVideoModel && (
                  <>
                    <Dropdown>
                      <MenuButton
                        slots={{ root: Button }}
                        slotProps={{
                          root: {
                            size: 'sm',
                            variant: 'plain',
                            color: 'neutral',
                            endDecorator: <KeyboardArrowDownIcon sx={{ fontSize: '0.9rem' }} />,
                          },
                        }}
                        sx={pillSx}
                      >
                        {props.duration || 5}s
                      </MenuButton>
                      <Menu placement='top' sx={{ borderRadius: '1.1rem', boxShadow: 'lg', minWidth: 132 }}>
                        {[5, 8, 10].map((sec) => (
                          <MenuItem key={sec} onClick={() => props.setDuration?.(sec)}>
                            {sec}s
                          </MenuItem>
                        ))}
                      </Menu>
                    </Dropdown>

                    <Dropdown>
                      <MenuButton
                        slots={{ root: Button }}
                        slotProps={{
                          root: {
                            size: 'sm',
                            variant: 'plain',
                            color: 'neutral',
                            endDecorator: <KeyboardArrowDownIcon sx={{ fontSize: '0.9rem' }} />,
                          },
                        }}
                        sx={pillSx}
                      >
                        {props.hd ? '1080P' : '720P'}
                      </MenuButton>
                      <Menu placement='top' sx={{ borderRadius: '1.1rem', boxShadow: 'lg', minWidth: 132 }}>
                        <MenuItem onClick={() => props.setHd?.(true)}>1080P</MenuItem>
                        <MenuItem onClick={() => props.setHd?.(false)}>720P</MenuItem>
                      </Menu>
                    </Dropdown>
                  </>
                )}
              </Box>
            </Box>

            <Box sx={{ ml: 'auto', display: 'flex', alignItems: 'center', gap: 1 }}>
              {typeof props.estimatedCoins === 'number' && (
                <Box
                  sx={{
                    px: 1.25,
                    py: 0.5,
                    borderRadius: '999px',
                    border: '1px solid',
                    borderColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255, 188, 92, 0.5)' : 'warning.outlinedBorder',
                    bgcolor: (theme) => theme.palette.mode === 'dark' ? 'rgba(146, 92, 14, 0.28)' : 'warning.softBg',
                    color: (theme) => theme.palette.mode === 'dark' ? '#FFD08A' : 'warning.700',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                    whiteSpace: 'nowrap',
                    boxShadow: (theme) => theme.palette.mode === 'dark' ? 'inset 0 0 0 1px rgba(56, 34, 4, 0.5)' : 'none',
                  }}
                >
                  预计消耗 {props.estimatedCoins} 🪙
                </Box>
              )}

              <Tooltip title='提示词优化（Ctrl+Alt+P，消耗3🪙）'>
                <Button
                  size='sm'
                  variant='soft'
                  color='neutral'
                  startDecorator={<AutoFixHighRoundedIcon />}
                  onClick={() => void handleOptimizePrompt()}
                  disabled={isOptimizing || !props.prompt.trim()}
                  sx={{
                    borderRadius: '999px',
                    px: { xs: 1.1, sm: 1.5 },
                    whiteSpace: 'nowrap',
                    minHeight: 36,
                  }}
                >
                  {isOptimizing ? '优化中...' : '提示词优化'}
                </Button>
              </Tooltip>

              <Button
                variant='solid'
                size='lg'
                color='warning'
                onClick={props.onGenerate}
                disabled={!props.prompt.trim()}
                sx={{
                  width: 52,
                  height: 52,
                  minWidth: 52,
                  borderRadius: '50%',
                  boxShadow: 'none',
                  '&:hover': {
                    boxShadow: 'none',
                  },
                }}
              >
                <ArrowUpwardIcon />
              </Button>
            </Box>
          </Box>
        </Box>

        <IconButton
          size='sm'
          variant='soft'
          color='neutral'
          onClick={() => props.setIsCollapsed(!props.isCollapsed)}
          sx={{
            position: 'absolute',
            bottom: 3,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 2,
            pointerEvents: 'auto',
            borderRadius: '2rem',
            width: 44,
            height: 12,
            minHeight: 12,
            backgroundColor: 'background.surface',
            border: '1px solid',
            borderColor: 'divider',
            boxShadow: 'none',
            '&:hover': {
              backgroundColor: 'neutral.softBg',
            },
            transition: 'all 0.2s',
            p: 0,
          }}
        >
          {props.isCollapsed
            ? <KeyboardArrowUpIcon sx={{ fontSize: '1rem', opacity: 0.6 }} />
            : <Box sx={{ width: 16, height: 2, borderRadius: '2px', bgcolor: 'neutral.softColor', opacity: 0.25 }} />}
        </IconButton>
      </Box>

      <Modal open={isOptimizeModalOpen} onClose={() => setIsOptimizeModalOpen(false)}>
        <ModalDialog
          layout='center'
          size='lg'
          sx={{
            width: 'min(920px, calc(100vw - 2rem))',
            maxHeight: 'calc(100vh - 2rem)',
            overflow: 'auto',
            borderRadius: '18px',
            border: '1px solid',
            borderColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.08)',
            background: (theme) => theme.palette.mode === 'dark'
              ? 'linear-gradient(180deg, rgba(16,20,30,0.98) 0%, rgba(12,15,24,0.98) 100%)'
              : 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
            boxShadow: (theme) => theme.palette.mode === 'dark'
              ? '0 24px 70px rgba(0,0,0,0.5)'
              : '0 24px 70px rgba(15,23,42,0.16)',
          }}
        >
          <ModalClose />
          <Typography level='h4'>提示词优化结果</Typography>
          <Typography level='body-sm' sx={{ color: 'text.tertiary', mb: 1 }}>
            使用模型 `gemini-3-pro-preview`，本次已消耗 3 🪙。请选择一个版本应用到输入框。
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {optimizeOptions.map((option, index) => (
              <Box
                key={`${option.style}-${index}`}
                sx={{
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: '12px',
                  p: 1.25,
                  bgcolor: 'background.level1',
                }}
              >
                <Typography level='title-sm' sx={{ mb: 0.75 }}>{option.style || `版本 ${index + 1}`}</Typography>
                <Textarea
                  minRows={4}
                  maxRows={12}
                  value={option.prompt}
                  readOnly
                  sx={{ '--Textarea-focusedHighlight': 'transparent' }}
                />
                <Box sx={{ mt: 1, display: 'flex', gap: 1, justifyContent: 'flex-end' }}>
                  <Button
                    size='sm'
                    variant='plain'
                    startDecorator={copiedIndex === index ? <CheckRoundedIcon /> : <ContentCopyRoundedIcon />}
                    onClick={async () => {
                      await copyToClipboard(option.prompt);
                      setCopiedIndex(index);
                      window.setTimeout(() => setCopiedIndex((prev) => (prev === index ? null : prev)), 1200);
                    }}
                  >
                    {copiedIndex === index ? '已复制' : '复制'}
                  </Button>
                  <Button
                    size='sm'
                    variant='solid'
                    color='primary'
                    onClick={() => {
                      props.setPrompt(option.prompt);
                      setIsOptimizeModalOpen(false);
                    }}
                  >
                    使用这个版本
                  </Button>
                </Box>
              </Box>
            ))}
          </Box>
        </ModalDialog>
      </Modal>

      <Modal open={!!previewImage} onClose={() => setPreviewImage(null)}>
        <ModalDialog
          layout='center'
          size='lg'
          sx={{
            width: 'min(980px, calc(100vw - 2rem))',
            maxHeight: 'calc(100vh - 2rem)',
            p: 1.5,
            borderRadius: '18px',
            border: '1px solid',
            borderColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(15,23,42,0.08)',
            background: (theme) => theme.palette.mode === 'dark'
              ? 'linear-gradient(180deg, rgba(16,20,30,0.98) 0%, rgba(12,15,24,0.98) 100%)'
              : 'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
            boxShadow: (theme) => theme.palette.mode === 'dark'
              ? '0 24px 70px rgba(0,0,0,0.5)'
              : '0 24px 70px rgba(15,23,42,0.16)',
          }}
        >
          <ModalClose />
          {previewImage && (
            <Box
              component='img'
              src={previewImage}
              alt='参考图预览'
              sx={{
                width: '100%',
                maxHeight: 'calc(100vh - 8rem)',
                objectFit: 'contain',
                borderRadius: '10px',
                userSelect: 'none',
              }}
            />
          )}
        </ModalDialog>
      </Modal>
    </>
  );
}

function SortableThumbnail({ img, onRemove, onPreview, tagLabel }: { img: UploadedImage; onRemove: () => void; onPreview: () => void; tagLabel?: string }) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: img.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <Box
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onPreview();
      }}
      sx={{
        position: 'relative',
        width: 66,
        height: 66,
        borderRadius: '10px',
        overflow: 'hidden',
        border: '1px solid',
        borderColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(255,255,255,0.12)' : 'rgba(15,23,42,0.14)',
        boxShadow: '0 2px 6px rgba(0,0,0,0.12)',
        cursor: 'grab',
        '&:active': { cursor: 'grabbing' },
        '&:hover': {
          borderColor: (theme) => theme.palette.mode === 'dark' ? 'rgba(129,140,248,0.8)' : 'rgba(59,130,246,0.7)',
          '& .thumb-delete-btn': {
            opacity: 1,
            transform: 'scale(1)',
          },
        },
        '@media (hover: none)': {
          '& .thumb-delete-btn': {
            opacity: 1,
            transform: 'scale(1)',
          },
        },
      }}
    >
      <Box
        component='img'
        src={img.data}
        alt={img.name || '参考图'}
        sx={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
        }}
      />
      {tagLabel && (
        <Box
          sx={{
            position: 'absolute',
            left: 3,
            bottom: 3,
            px: 0.7,
            py: 0.15,
            borderRadius: '7px',
            fontSize: '9.5px',
            lineHeight: 1.15,
            fontWeight: 500,
            fontFamily: '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif',
            letterSpacing: '0.08px',
            color: '#fff',
            bgcolor: 'rgba(15, 23, 42, 0.88)',
            border: '1px solid rgba(255,255,255,0.24)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.32)',
            textShadow: '0 1px 1px rgba(0,0,0,0.28)',
            pointerEvents: 'none',
          }}
        >
          {tagLabel}
        </Box>
      )}
      <IconButton
        size='sm'
        variant='solid'
        color='neutral'
        className='thumb-delete-btn'
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        sx={{
          position: 'absolute',
          top: 4,
          right: 4,
          width: 14,
          height: 14,
          minWidth: 14,
          minHeight: 14,
          borderRadius: '50%',
          p: 0,
          zIndex: 1,
          backgroundColor: 'rgba(0,0,0,0.56)',
          color: 'white',
          opacity: 0,
          transform: 'scale(0.84)',
          transition: 'opacity 0.14s ease, transform 0.14s ease, background-color 0.14s ease',
          '&:hover': { backgroundColor: 'rgba(220, 38, 38, 0.94)' },
          boxShadow: '0 1px 4px rgba(0,0,0,0.38)',
        }}
      >
        <CloseRoundedIcon sx={{ fontSize: '0.62rem' }} />
      </IconButton>
    </Box>
  );
}
