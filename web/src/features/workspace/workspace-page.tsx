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
import { useEffect, useRef, useState } from 'react'
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
import { defaultWorkspaceSettings } from './draft-defaults'
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

const emptyDraft: WorkspaceDraftState = {
  model: '',
  group: '',
  prompt: '',
  settings: {},
  assets: [],
}

export function WorkspacePage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<number>()
  const [mobileOpen, setMobileOpen] = useState(false)
  const [renameTarget, setRenameTarget] = useState<WorkspaceConversation>()
  const [deleteTarget, setDeleteTarget] = useState<WorkspaceConversation>()
  const [renameValue, setRenameValue] = useState('')
  const initialized = useRef(false)
  const initialParams = useRef(readWorkspaceSearch())
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
          createConversation.mutate(initialParams.current.type)
        })
      return
    }
    const first = conversations.data.items[0]
    if (first) {
      setSelectedId(first.id)
      return
    }
    createConversation.mutate(initialParams.current.type)
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
      onCreate={() => createConversation.mutate(initialParams.current.type)}
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
              initialType={initialParams.current.type}
              key={selectedId}
              conversationId={selectedId}
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
  initialType: WorkspaceType
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const balance = useAuthStore((state) => state.auth.user?.quota || 0)
  const setUser = useAuthStore((state) => state.auth.setUser)
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
    detail.data?.conversation.active_type || props.initialType
  )
  const [drafts, setDrafts] = useState<
    Record<WorkspaceType, WorkspaceDraftState>
  >(() => createDraftMap(detail.data, imageAssetItems, videoAssetItems))
  const [submitting, setSubmitting] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<number>()
  const [streamingRoundId, setStreamingRoundId] = useState<number>()
  const [streamingText, setStreamingText] = useState('')
  const [atLatest, setAtLatest] = useState(true)
  const [missingKey, setMissingKey] = useState<WorkspaceAPIKeyRequirement>()
  const hydrated = useRef(false)
  const initialScrollDone = useRef(false)
  const scrollArea = useRef<HTMLDivElement>(null)
  const observedStatuses = useRef(new Map<number, string>())
  const currentDraft = drafts[activeType]
  const capabilities = useQuery({
    queryKey: ['workspace', 'capabilities'],
    queryFn: getWorkspaceCapabilities,
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
    setActiveType(detail.data.conversation.active_type || props.initialType)
    setDrafts(createDraftMap(detail.data, imageAssetItems, videoAssetItems))
  }, [detail.data, imageAssetItems, props.initialType, videoAssetItems])

  useEffect(() => {
    if (!capabilities.data || !groups.data) return
    const models = workspaceModelOptions(activeType, capabilities.data)
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

  useEffect(() => {
    const element = scrollArea.current
    if (!element) return
    if (!initialScrollDone.current) {
      initialScrollDone.current = true
      element.scrollTop = element.scrollHeight
      return
    }
    if (atLatest) element.scrollTop = element.scrollHeight
  }, [atLatest, detail.data?.rounds.length, streamingText])

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
  const availableAssets =
    activeType === 'image'
      ? imageAssets.data?.items || []
      : [...(imageAssets.data?.items || []), ...(videoAssets.data?.items || [])]
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
        <header className='bg-background/95 flex h-14 shrink-0 items-center justify-between border-b px-4 pl-14 backdrop-blur md:pl-5'>
          <h1 className='truncate font-medium'>
            {detail.data.conversation.title}
          </h1>
          <span className='text-muted-foreground text-xs'>
            {t('Workspace')}
          </span>
        </header>
        <div className='relative min-h-0 flex-1'>
          <div
            ref={scrollArea}
            className='h-full overflow-y-auto px-4'
            onScroll={(event) => {
              const element = event.currentTarget
              setAtLatest(
                element.scrollHeight -
                  element.scrollTop -
                  element.clientHeight <
                  80
              )
            }}
          >
            <div className='mx-auto max-w-5xl'>
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
          </div>
          {!atLatest && (
            <Button
              className='absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full shadow-md'
              size='sm'
              variant='secondary'
              onClick={() =>
                scrollArea.current?.scrollTo({
                  top: scrollArea.current.scrollHeight,
                  behavior: 'smooth',
                })
              }
            >
              {t('Return to latest')}
            </Button>
          )}
        </div>
        <WorkspaceComposer
          assets={availableAssets}
          balance={balance}
          capabilities={capabilities.data}
          draft={drafts[activeType]}
          groups={groups.data || {}}
          submitting={submitting}
          uploadProgress={uploadProgress}
          type={activeType}
          onDraftChange={updateDraft}
          onSubmit={() => void submit()}
          onTypeChange={(type) => {
            setActiveType(type)
            void updateWorkspaceConversation(props.conversationId, {
              active_type: type,
            })
          }}
          onUpload={(kind, file) => void upload(kind, file)}
        />
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
    map[draft.type] = {
      model: draft.model,
      group: draft.group,
      prompt: draft.prompt,
      settings,
      assets: assets.filter((asset) => assetIds.includes(asset.id)),
    }
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
  return {
    model: round.model,
    group: round.group,
    prompt: round.prompt,
    settings,
    assets: assets.filter((asset) => assetIds.includes(asset.id)),
  }
}

function hasGeneratingVideo(detail?: WorkspaceConversationDetail) {
  return Boolean(
    detail?.rounds.some(
      (round) => round.type === 'video' && round.status === 'generating'
    )
  )
}

function readWorkspaceSearch(): { type: WorkspaceType; caseId?: number } {
  const params = new URLSearchParams(window.location.search)
  const type = params.get('type')
  const caseId = Number(params.get('caseId'))
  return {
    type: type === 'image' || type === 'video' ? type : 'text',
    caseId: Number.isInteger(caseId) && caseId > 0 ? caseId : undefined,
  }
}
