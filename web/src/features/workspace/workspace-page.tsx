/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { Menu01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'

import { PublicLayout } from '@/components/layout'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { getPricing } from '@/features/pricing/api'
import { getSelf } from '@/lib/api'
import { useAuthStore } from '@/stores/auth-store'

import {
  createWorkspaceConversation,
  createWorkspacePreset,
  createWorkspaceRound,
  deleteWorkspaceConversation,
  generateWorkspaceMedia,
  getWorkspaceAssets,
  getWorkspaceCapabilities,
  getWorkspaceConversation,
  getWorkspaceConversations,
  getWorkspaceGroups,
  saveWorkspaceDraft,
  streamWorkspaceText,
  updateWorkspaceConversation,
  uploadWorkspaceAsset,
  WorkspaceAPIKeyRequiredError,
} from './api'
import { ConversationSidebar } from './conversation-sidebar'
import {
  defaultWorkspaceSettings,
  normalizeWorkspaceDraft,
} from './draft-defaults'
import { workspaceGroupForModel, workspaceModelOptions } from './model-options'
import { RoundList } from './round-list'
import type {
  WorkspaceAsset,
  WorkspaceAPIKeyRequirement,
  WorkspaceConversation,
  WorkspaceConversationDetail,
  WorkspaceDraftState,
  WorkspaceModelCapability,
  WorkspaceRound,
  WorkspaceType,
} from './types'
import { WorkspaceComposer } from './workspace-composer'
import { isWorkspaceComposerCompact } from './workspace-composer-state'
import { resolveWorkspaceEntryType } from './workspace-entry'
import { WorkspaceScrollLayout } from './workspace-scroll-layout'

const emptyDraft: WorkspaceDraftState = {
  model: '',
  group: '',
  prompt: '',
  settings: {},
  assets: [],
}

export function WorkspacePage(props: {
  caseId?: number
  initialType?: WorkspaceType
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number>()
  const [entryType, setEntryType] = useState(props.initialType)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<WorkspaceConversation>()
  const [deleteTarget, setDeleteTarget] = useState<WorkspaceConversation>()
  const [renameValue, setRenameValue] = useState('')
  const clearEntryType = useCallback(() => setEntryType(undefined), [])
  const initialized = useRef(false)
  const initialParams = useRef({
    caseId: props.caseId,
    type: props.initialType,
  })
  const conversations = useQuery({
    queryKey: ['workspace', 'conversations', search],
    queryFn: () => getWorkspaceConversations(search),
  })
  const createConversation = useMutation({
    mutationFn: createWorkspaceConversation,
    onSuccess: async (conversation) => {
      setSelectedId(conversation.id)
      await queryClient.invalidateQueries({
        queryKey: ['workspace', 'conversations'],
      })
    },
  })

  useEffect(() => {
    if (initialized.current || !conversations.data) return
    initialized.current = true
    const caseId = initialParams.current.caseId
    if (caseId) {
      void createWorkspacePreset(caseId)
        .then(async (preset) => {
          setSelectedId(preset.conversation.id)
          await queryClient.invalidateQueries({
            queryKey: ['workspace', 'conversations'],
          })
        })
        .catch(() => {
          toast.error(t('Unable to load case preset'))
          createConversation.mutate(initialParams.current.type || 'text')
        })
      return
    }
    const first = conversations.data.items[0]
    if (first) {
      setSelectedId(first.id)
      return
    }
    createConversation.mutate(initialParams.current.type || 'text')
  }, [conversations.data, createConversation, queryClient, t])

  const selectConversation = (id: number) => {
    setSelectedId(id)
    setMobileOpen(false)
  }
  const sidebar = (
    <ConversationSidebar
      conversations={conversations.data?.items || []}
      search={search}
      selectedId={selectedId}
      onCreate={() =>
        createConversation.mutate(initialParams.current.type || 'text')
      }
      onDelete={setDeleteTarget}
      onRename={(conversation) => {
        setRenameValue(conversation.title)
        setRenameTarget(conversation)
      }}
      onSearchChange={setSearch}
      onSelect={selectConversation}
    />
  )

  return (
    <PublicLayout showMainContainer={false}>
      <main className='flex h-svh overflow-hidden pt-16'>
        <div className='hidden h-full w-72 shrink-0 md:block'>{sidebar}</div>
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent className='w-72 p-0' side='left'>
            <SheetHeader className='sr-only'>
              <SheetTitle>{t('Conversations')}</SheetTitle>
              <SheetDescription>
                {t('Workspace conversation history')}
              </SheetDescription>
            </SheetHeader>
            {sidebar}
          </SheetContent>
        </Sheet>
        <section className='relative min-w-0 flex-1'>
          <Button
            aria-label={t('Open conversations')}
            className='absolute top-3 left-3 z-20 md:hidden'
            size='icon-sm'
            variant='outline'
            onClick={() => setMobileOpen(true)}
          >
            <HugeiconsIcon icon={Menu01Icon} strokeWidth={2} />
          </Button>
          {selectedId ? (
            <WorkspaceSession
              initialType={entryType}
              key={selectedId}
              conversationId={selectedId}
              onInitialTypeApplied={clearEntryType}
            />
          ) : (
            <div className='text-muted-foreground flex h-full items-center justify-center text-sm'>
              {t('Loading workspace...')}
            </div>
          )}
        </section>
      </main>

      <Dialog
        open={Boolean(renameTarget)}
        onOpenChange={(open) => !open && setRenameTarget(undefined)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Rename conversation')}</DialogTitle>
            <DialogDescription>
              {t('Choose a short name that helps you find this conversation.')}
            </DialogDescription>
          </DialogHeader>
          <Input
            aria-label={t('Conversation name')}
            maxLength={200}
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
          />
          <DialogFooter>
            <DialogClose render={<Button variant='outline' />}>
              {t('Cancel')}
            </DialogClose>
            <Button
              disabled={!renameValue.trim()}
              onClick={() => {
                if (!renameTarget) return
                void updateWorkspaceConversation(renameTarget.id, {
                  title: renameValue,
                }).then(async () => {
                  setRenameTarget(undefined)
                  await queryClient.invalidateQueries({
                    queryKey: ['workspace', 'conversations'],
                  })
                })
              }}
            >
              {t('Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => !open && setDeleteTarget(undefined)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Delete conversation')}</DialogTitle>
            <DialogDescription>
              {t(
                'This removes the conversation and all of its generated rounds.'
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant='outline' />}>
              {t('Cancel')}
            </DialogClose>
            <Button
              variant='destructive'
              onClick={() => {
                if (!deleteTarget) return
                void deleteWorkspaceConversation(deleteTarget.id).then(
                  async () => {
                    if (selectedId === deleteTarget.id) {
                      setSelectedId(undefined)
                    }
                    setDeleteTarget(undefined)
                    initialized.current = false
                    await queryClient.invalidateQueries({
                      queryKey: ['workspace', 'conversations'],
                    })
                  }
                )
              }}
            >
              {t('Delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PublicLayout>
  )
}

function WorkspaceSession(props: {
  conversationId: number
  initialType?: WorkspaceType
  onInitialTypeApplied: () => void
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const balance = useAuthStore((state) => state.auth.user?.quota || 0)
  const setUser = useAuthStore((state) => state.auth.setUser)
  useEffect(() => {
    void refreshWorkspaceUser(setUser)
  }, [setUser])
  const detail = useQuery({
    queryKey: ['workspace', 'conversation', props.conversationId],
    queryFn: () => getWorkspaceConversation(props.conversationId),
    refetchInterval: (query) =>
      hasGeneratingVideo(query.state.data) ? 3000 : false,
  })
  const groups = useQuery({
    queryKey: ['workspace', 'groups'],
    queryFn: getWorkspaceGroups,
  })
  const imageAssets = useQuery({
    queryKey: ['workspace', 'assets', 'image'],
    queryFn: () => getWorkspaceAssets('image'),
  })
  const videoAssets = useQuery({
    queryKey: ['workspace', 'assets', 'video'],
    queryFn: () => getWorkspaceAssets('video'),
  })
  const imageAssetItems = imageAssets.data?.items
  const videoAssetItems = videoAssets.data?.items
  const [activeType, setActiveType] = useState<WorkspaceType>(
    resolveWorkspaceEntryType(
      props.initialType,
      detail.data?.conversation.active_type
    )
  )
  const [drafts, setDrafts] = useState<
    Record<WorkspaceType, WorkspaceDraftState>
  >(() => createDraftMap(detail.data, imageAssetItems, videoAssetItems))
  const [submitting, setSubmitting] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number>()
  const [streamingRoundId, setStreamingRoundId] = useState<number>()
  const [streamingText, setStreamingText] = useState('')
  const [atLatest, setAtLatest] = useState(true)
  const [composerInteracting, setComposerInteracting] = useState(false)
  const [missingKey, setMissingKey] = useState<WorkspaceAPIKeyRequirement>()
  const hydrated = useRef(false)
  const observedStatuses = useRef(new Map<number, string>())
  const requestedEntryType = props.initialType
  const notifyInitialTypeApplied = props.onInitialTypeApplied
  const sessionConversationId = props.conversationId
  const currentDraft = drafts[activeType]
  const capabilities = useQuery({
    queryKey: ['workspace', 'capabilities'],
    queryFn: getWorkspaceCapabilities,
  })
  const pricing = useQuery({
    queryKey: ['pricing'],
    queryFn: getPricing,
    staleTime: 5 * 60 * 1000,
  })

  useEffect(() => {
    if (
      hydrated.current ||
      !detail.data ||
      !imageAssetItems ||
      !videoAssetItems
    ) {
      return
    }
    hydrated.current = true
    const resolvedEntryType = resolveWorkspaceEntryType(
      requestedEntryType,
      detail.data.conversation.active_type
    )
    setActiveType(resolvedEntryType)
    if (
      requestedEntryType &&
      requestedEntryType !== detail.data.conversation.active_type
    ) {
      void updateWorkspaceConversation(sessionConversationId, {
        active_type: requestedEntryType,
      })
    }
    if (requestedEntryType) notifyInitialTypeApplied()
    setDrafts(createDraftMap(detail.data, imageAssetItems, videoAssetItems))
  }, [
    detail.data,
    imageAssetItems,
    requestedEntryType,
    videoAssetItems,
    notifyInitialTypeApplied,
    sessionConversationId,
  ])

  useEffect(() => {
    if (!capabilities.data || !groups.data || !pricing.data) return
    const models = workspaceModelOptions(
      activeType,
      capabilities.data,
      pricing.data
    )
    let model = models[0]?.model || ''
    if (currentDraft.model) {
      model = models.some((item) => item.model === currentDraft.model)
        ? currentDraft.model
        : ''
    }
    const modelOption = models.find((item) => item.model === model)
    const group = workspaceGroupForModel(
      modelOption,
      currentDraft.group,
      groups.data
    )
    if (group === currentDraft.group && model === currentDraft.model) return
    let capability: WorkspaceModelCapability | undefined
    if (activeType === 'image') {
      capability = capabilities.data.image_models.find(
        (item) => item.model === model
      )
    } else if (activeType === 'video') {
      capability = capabilities.data.video_models.find(
        (item) => item.model === model
      )
    }
    setDrafts((current) => ({
      ...current,
      [activeType]: {
        ...current[activeType],
        group,
        model,
        settings:
          model && !currentDraft.model
            ? defaultWorkspaceSettings(capability)
            : current[activeType].settings,
      },
    }))
  }, [
    activeType,
    capabilities.data,
    currentDraft.group,
    currentDraft.model,
    groups.data,
    pricing.data,
  ])

  useEffect(() => {
    if (!hydrated.current) return
    const timeout = window.setTimeout(() => {
      void saveWorkspaceDraft(
        props.conversationId,
        activeType,
        drafts[activeType]
      )
    }, 700)
    return () => window.clearTimeout(timeout)
  }, [activeType, drafts, props.conversationId])

  useEffect(() => {
    if (!detail.data) return
    for (const round of detail.data.rounds) {
      const previous = observedStatuses.current.get(round.id)
      observedStatuses.current.set(round.id, round.status)
      if (previous !== 'generating') continue
      if (round.status === 'succeeded') toast.success(t('Completed'))
      if (round.status === 'failed') {
        toast.error(round.error || t('Generation failed'))
      }
    }
  }, [detail.data, t])

  const updateDraft = (draft: WorkspaceDraftState) =>
    setDrafts((current) => ({ ...current, [activeType]: draft }))

  const submit = async (
    requestedType: WorkspaceType = activeType,
    requestedDraft: WorkspaceDraftState = drafts[requestedType]
  ) => {
    if (submitting) return
    setSubmitting(true)
    const draft = requestedDraft
    try {
      await saveWorkspaceDraft(props.conversationId, requestedType, draft)
      const round = await createWorkspaceRound(
        props.conversationId,
        requestedType,
        draft
      )
      await queryClient.invalidateQueries({
        queryKey: ['workspace', 'conversation', props.conversationId],
      })
      if (requestedType === 'text') {
        setStreamingRoundId(round.id)
        setStreamingText('')
        let accumulated = ''
        await streamWorkspaceText(round, detail.data?.rounds || [], {
          onChunk: (chunk) => {
            accumulated += chunk
            setStreamingText(accumulated)
          },
          onComplete: () => {
            setStreamingRoundId(undefined)
            void queryClient
              .invalidateQueries({
                queryKey: ['workspace', 'conversation', props.conversationId],
              })
              .then(() => refreshWorkspaceUser(setUser))
          },
          onError: (message) => {
            setStreamingRoundId(undefined)
            toast.error(message)
            void queryClient.invalidateQueries({
              queryKey: ['workspace', 'conversation', props.conversationId],
            })
          },
          onAPIKeyRequired: (requirement) => {
            setStreamingRoundId(undefined)
            setMissingKey(requirement)
            void queryClient.invalidateQueries({
              queryKey: ['workspace', 'conversation', props.conversationId],
            })
          },
        })
      } else {
        await generateWorkspaceMedia(round, draft)
        await queryClient.invalidateQueries({
          queryKey: ['workspace', 'conversation', props.conversationId],
        })
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: ['workspace', 'assets', 'image'],
          }),
          queryClient.invalidateQueries({
            queryKey: ['workspace', 'assets', 'video'],
          }),
          refreshWorkspaceUser(setUser),
        ])
      }
      await queryClient.invalidateQueries({
        queryKey: ['workspace', 'conversations'],
      })
    } catch (error) {
      if (error instanceof WorkspaceAPIKeyRequiredError) {
        setMissingKey(error.requirement)
        return
      }
      toast.error(
        error instanceof Error ? error.message : t('Generation failed')
      )
    } finally {
      setSubmitting(false)
    }
  }

  const upload = async (kind: 'image' | 'video', file: File) => {
    setUploadProgress(0)
    try {
      const asset = await uploadWorkspaceAsset(kind, file, setUploadProgress)
      updateDraft({
        ...drafts[activeType],
        assets: [...drafts[activeType].assets, asset],
      })
      await queryClient.invalidateQueries({
        queryKey: ['workspace', 'assets', kind],
      })
      toast.success(t('Asset uploaded'))
    } catch {
      toast.error(t('Unable to upload asset'))
    } finally {
      setUploadProgress(undefined)
    }
  }

  if (!detail.data) {
    return (
      <div className='text-muted-foreground flex h-full items-center justify-center text-sm'>
        {t('Loading conversation...')}
      </div>
    )
  }
  const allAssets = [
    ...(imageAssets.data?.items || []),
    ...(videoAssets.data?.items || []),
  ]
  const editRound = (round: WorkspaceRound) => {
    const draft = draftFromRound(round, allAssets)
    setActiveType(round.type)
    setDrafts((current) => ({ ...current, [round.type]: draft }))
    void updateWorkspaceConversation(props.conversationId, {
      active_type: round.type,
    })
  }
  return (
    <>
      <div className='flex h-full min-h-0 flex-col'>
        <WorkspaceScrollLayout
          onAtLatestChange={setAtLatest}
          onScrollAwayFromComposer={() => setComposerInteracting(false)}
          composer={
            <WorkspaceComposer
              balance={balance}
              capabilities={capabilities.data}
              compact={isWorkspaceComposerCompact(
                atLatest,
                composerInteracting
              )}
              pricing={pricing.data}
              draft={drafts[activeType]}
              groups={groups.data || {}}
              submitting={submitting}
              uploadProgress={uploadProgress}
              type={activeType}
              onDraftChange={updateDraft}
              onExpand={() => setComposerInteracting(true)}
              onInteractionChange={setComposerInteracting}
              onSubmit={() => void submit()}
              onTypeChange={(type) => {
                setActiveType(type)
                void updateWorkspaceConversation(props.conversationId, {
                  active_type: type,
                })
              }}
              onUpload={(kind, file) => void upload(kind, file)}
            />
          }
        >
          <div className='mx-auto max-w-5xl pt-14 md:pt-0'>
            <RoundList
              rounds={detail.data.rounds}
              streamingRoundId={streamingRoundId}
              streamingText={streamingText}
              onEdit={editRound}
              onRetry={(round) =>
                void submit(round.type, draftFromRound(round, allAssets))
              }
            />
          </div>
        </WorkspaceScrollLayout>
      </div>
      <Dialog
        open={Boolean(missingKey)}
        onOpenChange={(open) => !open && setMissingKey(undefined)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('Missing required API Key')}</DialogTitle>
            <DialogDescription>
              {t(
                'The selected group has no usable API Key. Add one before generating.'
              )}
            </DialogDescription>
          </DialogHeader>
          <div className='space-y-3 rounded-lg border p-4 text-sm'>
            <div className='flex items-center justify-between gap-4'>
              <span className='text-muted-foreground'>
                {t('Current model')}
              </span>
              <span className='font-medium'>{missingKey?.model}</span>
            </div>
            <div className='flex items-center justify-between gap-4'>
              <span className='text-muted-foreground'>
                {t('Required Key type')}
              </span>
              <span className='bg-primary/10 text-primary rounded-full px-2.5 py-1 font-medium'>
                {missingKey?.key_type}
              </span>
            </div>
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant='outline' />}>
              {t('Cancel')}
            </DialogClose>
            {missingKey && (
              <Button
                render={
                  <Link
                    to='/keys'
                    search={{ create: true, group: missingKey.group }}
                  />
                }
              >
                {t('Add API Key')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

async function refreshWorkspaceUser(
  setUser: ReturnType<typeof useAuthStore.getState>['auth']['setUser']
) {
  const response = await getSelf()
  if (response?.success && response.data) setUser(response.data)
}

function createDraftMap(
  detail?: WorkspaceConversationDetail,
  images: WorkspaceAsset[] = [],
  videos: WorkspaceAsset[] = []
) {
  const assets = [...images, ...videos]
  const map: Record<WorkspaceType, WorkspaceDraftState> = {
    text: { ...emptyDraft, settings: {}, assets: [] },
    image: { ...emptyDraft, settings: {}, assets: [] },
    video: { ...emptyDraft, settings: {}, assets: [] },
  }
  for (const draft of detail?.drafts || []) {
    let settings = {}
    let assetIds: number[] = []
    try {
      settings = draft.settings ? JSON.parse(draft.settings) : {}
      assetIds = draft.asset_ids ? JSON.parse(draft.asset_ids) : []
    } catch {
      settings = {}
      assetIds = []
    }
    map[draft.type] = normalizeWorkspaceDraft({
      model: draft.model,
      group: draft.group,
      prompt: draft.prompt,
      settings,
      assets: assets.filter((asset) => assetIds.includes(asset.id)),
    })
  }
  return map
}

function draftFromRound(
  round: WorkspaceRound,
  assets: WorkspaceAsset[]
): WorkspaceDraftState {
  let settings: WorkspaceDraftState['settings'] = {}
  let assetIds: number[] = []
  try {
    settings = round.settings ? JSON.parse(round.settings) : {}
    assetIds = round.asset_ids ? JSON.parse(round.asset_ids) : []
  } catch {
    settings = {}
    assetIds = []
  }
  return normalizeWorkspaceDraft({
    model: round.model,
    group: round.group,
    prompt: round.prompt,
    settings,
    assets: assets.filter((asset) => assetIds.includes(asset.id)),
  })
}

function hasGeneratingVideo(detail?: WorkspaceConversationDetail) {
  return Boolean(
    detail?.rounds.some(
      (round) => round.type === 'video' && round.status === 'generating'
    )
  )
}
