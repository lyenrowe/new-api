/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import {
  Add01Icon,
  AiImageIcon,
  AiVideoIcon,
  ArrowDown01Icon,
  Cancel01Icon,
  SentIcon,
  TextCreationIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import type { PricingData } from '@/features/pricing/types'
import { formatQuota } from '@/lib/format'
import { cn } from '@/lib/utils'

import { defaultWorkspaceSettings } from './draft-defaults'
import {
  workspaceFirstModelForVendor,
  workspaceGroupForModel,
  workspaceModelOptions,
} from './model-options'
import type {
  WorkspaceAsset,
  WorkspaceCapabilities,
  WorkspaceDraftState,
  WorkspaceModelCapability,
  WorkspaceType,
} from './types'

type WorkspaceComposerProps = {
  type: WorkspaceType
  draft: WorkspaceDraftState
  capabilities?: WorkspaceCapabilities
  pricing?: PricingData
  groups: Record<string, { desc: string; ratio: number | string }>
  balance: number
  submitting: boolean
  compact: boolean
  uploadProgress?: number
  onTypeChange: (type: WorkspaceType) => void
  onDraftChange: (draft: WorkspaceDraftState) => void
  onUpload: (kind: 'image' | 'video', file: File) => void
  onSubmit: () => void
  onExpand: () => void
  onInteractionChange: (interacting: boolean) => void
}

const typeIcons = {
  text: TextCreationIcon,
  image: AiImageIcon,
  video: AiVideoIcon,
}

const imageAspectRatios = [
  '1:1',
  '3:4',
  '4:3',
  '16:9',
  '9:16',
  '2:3',
  '3:2',
  '21:9',
]
const imageResolutions = ['2K', '4K']

export function WorkspaceComposer(props: WorkspaceComposerProps) {
  const { t } = useTranslation()
  const composer = useRef<HTMLDivElement>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const promptInput = useRef<HTMLTextAreaElement>(null)
  const focusAfterExpand = useRef(false)
  const capability = selectedCapability(
    props.type,
    props.draft.model,
    props.capabilities
  )
  const modelOptions = workspaceModelOptions(
    props.type,
    props.capabilities,
    props.pricing
  )
  const selectedModel = modelOptions.find(
    (option) => option.model === props.draft.model
  )
  const vendors = [...new Set(modelOptions.map((option) => option.vendor))]
  const [vendorSelections, setVendorSelections] = useState<
    Record<WorkspaceType, string>
  >({ text: '', image: '', video: '' })
  const overlayOpen = useRef(false)
  const focusWithin = useRef(false)
  const rememberedVendor = vendorSelections[props.type]
  const selectedVendor =
    selectedModel?.vendor ||
    (vendors.includes(rememberedVendor) ? rememberedVendor : '') ||
    modelOptions[0]?.vendor ||
    ''
  const visibleModels = modelOptions.filter(
    (option) => option.vendor === selectedVendor
  )
  const availableGroups = selectedModel?.groups.filter((group) =>
    Object.hasOwn(props.groups, group)
  )
  const disabled =
    props.submitting ||
    !props.draft.prompt.trim() ||
    !props.draft.model ||
    !props.draft.group
  const frameReferences = usesFrameReferenceSlots(
    props.type,
    props.draft.model,
    props.draft.settings.mode
  )
  const referenceLimit = workspaceReferenceImageLimit(
    props.type,
    capability,
    props.draft.settings.mode
  )
  let editorGridClass = 'grid-cols-1'
  if (props.type !== 'text') {
    editorGridClass = frameReferences
      ? 'grid-cols-[12.5rem_minmax(0,1fr)]'
      : 'grid-cols-[6.75rem_minmax(0,1fr)]'
  }

  useLayoutEffect(() => {
    if (props.compact || !focusAfterExpand.current) return
    focusAfterExpand.current = false
    if (!composer.current?.contains(document.activeElement)) {
      promptInput.current?.focus()
    }
  }, [props.compact])

  return (
    <div
      ref={composer}
      className={cn(
        'bg-background/96 mx-auto w-full max-w-5xl overflow-visible rounded-2xl border shadow-xl backdrop-blur-xl',
        'transition-[padding] duration-150 ease-out motion-reduce:transition-none',
        props.compact ? 'p-2' : 'p-3'
      )}
      data-workspace-composer={props.compact ? 'compact' : 'expanded'}
      onClick={props.compact ? props.onExpand : undefined}
      onFocusCapture={() => {
        if (focusWithin.current) return
        focusWithin.current = true
        if (props.compact) focusAfterExpand.current = true
        props.onInteractionChange(true)
        props.onExpand()
      }}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          focusWithin.current = false
          props.onInteractionChange(overlayOpen.current)
        }
      }}
    >
      {props.compact ? (
        <CompactComposer
          capability={capability}
          disabled={disabled}
          draft={props.draft}
          submitting={props.submitting}
          type={props.type}
          onDraftChange={props.onDraftChange}
          onExpand={props.onExpand}
          onSubmit={props.onSubmit}
          onUpload={() => fileInput.current?.click()}
        />
      ) : (
        <div className='space-y-3'>
          <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
            <Tabs
              value={props.type}
              onValueChange={(value) =>
                props.onTypeChange(value as WorkspaceType)
              }
            >
              <TabsList>
                {(['text', 'image', 'video'] as const).map((type) => (
                  <TabsTrigger key={type} value={type}>
                    <HugeiconsIcon icon={typeIcons[type]} strokeWidth={2} />
                    {t(workspaceTypeLabel(type))}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <div className='flex min-w-0 flex-1 items-center gap-2 sm:max-w-[32rem]'>
              <NativeSelect
                aria-label={t('Provider')}
                className='min-w-0 flex-1 sm:min-w-32 sm:flex-none'
                value={selectedVendor}
                onChange={(event) => {
                  const vendor = event.target.value
                  if (!confirmModelReset(props, t)) return
                  const option = workspaceFirstModelForVendor(
                    modelOptions,
                    vendor
                  )
                  const model = option?.model || ''
                  setVendorSelections((current) => ({
                    ...current,
                    [props.type]: vendor,
                  }))
                  props.onDraftChange({
                    ...props.draft,
                    model,
                    group: workspaceGroupForModel(
                      option,
                      props.draft.group,
                      props.groups
                    ),
                    settings: defaultWorkspaceSettings(
                      selectedCapability(props.type, model, props.capabilities)
                    ),
                    assets: [],
                  })
                }}
              >
                <NativeSelectOption value=''>
                  {t('Select provider')}
                </NativeSelectOption>
                {vendors.map((vendor) => (
                  <NativeSelectOption key={vendor} value={vendor}>
                    {vendor}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <NativeSelect
                aria-label={t('Model')}
                className='min-w-0 flex-[1.4]'
                value={props.draft.model}
                onChange={(event) => {
                  const model = event.target.value
                  if (
                    model !== props.draft.model &&
                    !confirmModelReset(props, t)
                  ) {
                    return
                  }
                  const option = modelOptions.find(
                    (candidate) => candidate.model === model
                  )
                  props.onDraftChange({
                    ...props.draft,
                    model,
                    group: workspaceGroupForModel(
                      option,
                      props.draft.group,
                      props.groups
                    ),
                    settings: defaultWorkspaceSettings(
                      selectedCapability(props.type, model, props.capabilities)
                    ),
                    assets: [],
                  })
                }}
              >
                <NativeSelectOption value=''>
                  {t('Select a model')}
                </NativeSelectOption>
                {visibleModels.map((option) => (
                  <NativeSelectOption key={option.model} value={option.model}>
                    {option.model}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          </div>

          <input
            ref={fileInput}
            accept='image/*'
            className='hidden'
            type='file'
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file && imageCount(props.draft.assets) < referenceLimit) {
                props.onUpload('image', file)
              }
              event.target.value = ''
            }}
          />

          <div
            className={cn('grid min-w-0 items-start gap-3', editorGridClass)}
            data-workspace-editor-layout
          >
            {props.type !== 'text' && frameReferences && (
              <FrameReferences
                assets={props.draft.assets}
                disabled={props.uploadProgress !== undefined}
                onRemove={(asset, frame) =>
                  props.onDraftChange({
                    ...props.draft,
                    assets:
                      frame === 'first'
                        ? props.draft.assets.filter(
                            (current) => current.kind !== 'image'
                          )
                        : props.draft.assets.filter(
                            (current) => current.id !== asset.id
                          ),
                  })
                }
                onUpload={() => fileInput.current?.click()}
              />
            )}
            {props.type !== 'text' && !frameReferences && (
              <ReferenceImages
                assets={props.draft.assets}
                disabled={props.uploadProgress !== undefined}
                label={
                  props.type === 'video'
                    ? t('Reference content')
                    : t('Reference images')
                }
                maxImages={referenceLimit}
                onOpenChange={(open) => {
                  overlayOpen.current = open
                  props.onInteractionChange(open || focusWithin.current)
                }}
                onRemove={(asset) =>
                  props.onDraftChange({
                    ...props.draft,
                    assets: props.draft.assets.filter(
                      (current) => current.id !== asset.id
                    ),
                  })
                }
                onUpload={() => fileInput.current?.click()}
              />
            )}
            <Textarea
              ref={promptInput}
              aria-label={t('Prompt')}
              className='max-h-[min(40svh,20rem)] min-h-28 resize-none border-0 bg-transparent px-1 py-2 shadow-none focus-visible:ring-0'
              placeholder={t('Describe what you want to create')}
              value={props.draft.prompt}
              onChange={(event) =>
                props.onDraftChange({
                  ...props.draft,
                  prompt: event.target.value,
                })
              }
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault()
                  if (!disabled) props.onSubmit()
                }
              }}
            />
          </div>

          <div className='flex min-w-0 flex-wrap items-center gap-2 border-t pt-3'>
            {props.type === 'image' && capability && (
              <ImageSettings
                capability={capability}
                draft={props.draft}
                onDraftChange={props.onDraftChange}
                onOpenChange={(open) => {
                  overlayOpen.current = open
                  props.onInteractionChange(open || focusWithin.current)
                }}
              />
            )}
            {props.type === 'video' && capability && (
              <VideoOptions
                capability={capability}
                draft={props.draft}
                onDraftChange={props.onDraftChange}
              />
            )}
            {props.uploadProgress !== undefined && (
              <span className='text-muted-foreground text-xs'>
                {t('Upload')} {props.uploadProgress}%
              </span>
            )}
            <NativeSelect
              aria-label={t('Group')}
              className='ml-auto max-w-48 min-w-28'
              value={props.draft.group}
              onChange={(event) =>
                props.onDraftChange({
                  ...props.draft,
                  group: event.target.value,
                })
              }
            >
              <NativeSelectOption value=''>
                {t('Select group')}
              </NativeSelectOption>
              {(availableGroups || []).map((name) => (
                <NativeSelectOption key={name} value={name}>
                  {props.groups[name]?.desc || name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <span className='text-muted-foreground shrink-0 text-xs'>
              {t('Balance')}: {formatQuota(props.balance)}
            </span>
            <Button disabled={disabled} onClick={props.onSubmit}>
              <HugeiconsIcon icon={SentIcon} strokeWidth={2} />
              <span className='hidden sm:inline'>
                {props.submitting ? t('Submitting...') : t('Generate')}
              </span>
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function CompactComposer(props: {
  type: WorkspaceType
  capability?: WorkspaceModelCapability
  draft: WorkspaceDraftState
  disabled: boolean
  submitting: boolean
  onDraftChange: (draft: WorkspaceDraftState) => void
  onExpand: () => void
  onSubmit: () => void
  onUpload: () => void
}) {
  const { t } = useTranslation()
  const frameReferences = usesFrameReferenceSlots(
    props.type,
    props.draft.model,
    props.draft.settings.mode
  )
  let referenceLabel: string | undefined
  if (frameReferences) {
    referenceLabel = t('First and last frame')
  } else if (props.type === 'video') {
    referenceLabel = t('Reference content')
  }
  return (
    <div className='flex min-w-0 items-center gap-2'>
      {props.type !== 'text' && (
        <ReferenceImageStack
          assets={props.draft.assets}
          compact
          emptyLabel={frameReferences ? t('Add first frame') : undefined}
          label={referenceLabel}
          onOpen={props.onExpand}
          onUpload={props.onUpload}
        />
      )}
      <button
        className='text-muted-foreground focus-visible:ring-ring/50 min-w-0 flex-1 truncate px-2 text-left text-sm outline-none focus-visible:ring-2'
        type='button'
        onClick={props.onExpand}
      >
        {props.draft.prompt || t('Describe what you want to create')}
      </button>
      {props.type === 'image' && props.capability && (
        <ImageSettings
          capability={props.capability}
          compact
          draft={props.draft}
          onDraftChange={props.onDraftChange}
          onOpenChange={() => {}}
        />
      )}
      <Button
        aria-label={props.submitting ? t('Submitting...') : t('Generate')}
        disabled={props.disabled}
        size='icon'
        onClick={(event) => {
          event.stopPropagation()
          props.onSubmit()
        }}
      >
        <HugeiconsIcon icon={SentIcon} strokeWidth={2} />
      </Button>
    </div>
  )
}

function FrameReferences(props: {
  assets: WorkspaceAsset[]
  disabled: boolean
  onRemove: (asset: WorkspaceAsset, frame: 'first' | 'last') => void
  onUpload: () => void
}) {
  const { t } = useTranslation()
  const images = props.assets
    .filter((asset) => asset.kind === 'image')
    .slice(0, 2)
  const frames = [
    {
      asset: images[0],
      frame: 'first' as const,
      label: t('First frame'),
      addLabel: t('Add first frame'),
      disabled: props.disabled,
    },
    {
      asset: images[1],
      frame: 'last' as const,
      label: t('Last frame'),
      addLabel: t('Add last frame'),
      disabled: props.disabled || !images[0],
    },
  ]

  return (
    <div className='flex h-28 items-stretch gap-2' data-frame-references>
      {frames.map((item) => (
        <div className='relative h-28 w-24 shrink-0' key={item.frame}>
          {item.asset ? (
            <>
              <img
                alt={item.asset.name}
                className='h-full w-full rounded-xl border object-cover shadow-sm'
                src={item.asset.public_url}
              />
              <span className='bg-background/85 absolute inset-x-1 bottom-1 truncate rounded px-1 py-0.5 text-center text-xs font-medium backdrop-blur-sm'>
                {item.label}
              </span>
              <Button
                aria-label={
                  item.frame === 'first'
                    ? t('Remove first frame')
                    : t('Remove last frame')
                }
                className='absolute -top-1.5 -right-1.5 rounded-full shadow-sm'
                size='icon-xs'
                variant='secondary'
                onClick={() => props.onRemove(item.asset, item.frame)}
              >
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
              </Button>
            </>
          ) : (
            <button
              aria-label={item.addLabel}
              className='text-muted-foreground hover:text-foreground hover:bg-muted bg-background focus-visible:ring-ring/50 flex h-full w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-2 outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-40'
              disabled={item.disabled}
              type='button'
              onClick={props.onUpload}
            >
              <HugeiconsIcon
                className='size-6'
                icon={Add01Icon}
                strokeWidth={2}
              />
              <span className='text-xs font-medium'>{item.label}</span>
            </button>
          )}
        </div>
      ))}
    </div>
  )
}

function ReferenceImages(props: {
  assets: WorkspaceAsset[]
  disabled: boolean
  label: string
  maxImages: number
  onOpenChange: (open: boolean) => void
  onRemove: (asset: WorkspaceAsset) => void
  onUpload: () => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const closeTimer = useRef<number | undefined>(undefined)
  const images = props.assets
    .filter((asset) => asset.kind === 'image')
    .slice(0, props.maxImages)
  const assets = [
    ...props.assets.filter((asset) => asset.kind === 'video').slice(0, 1),
    ...images,
  ]
  const topAsset = assets.at(-1)

  useEffect(
    () => () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current)
    },
    []
  )

  const changeOpen = (nextOpen: boolean) => {
    setOpen(nextOpen)
    props.onOpenChange(nextOpen)
  }
  const openNow = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    changeOpen(true)
  }
  const closeSoon = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => changeOpen(false), 140)
  }

  return (
    <div
      className='group/reference relative h-28 w-[6.75rem]'
      data-reference-slot='single'
      onFocusCapture={openNow}
      onMouseEnter={openNow}
      onMouseLeave={closeSoon}
    >
      <Popover open={open} onOpenChange={changeOpen}>
        <PopoverTrigger
          render={
            <ReferenceImageStack
              assets={assets}
              disabled={props.disabled}
              label={props.label}
              onOpen={openNow}
              onUpload={props.onUpload}
            />
          }
        />
        <PopoverContent
          aria-label={props.label}
          className='w-auto max-w-[calc(100vw-2rem)] gap-2 overflow-x-auto p-3'
          align='start'
          collisionPadding={12}
          side='top'
          sideOffset={8}
          onMouseEnter={openNow}
          onMouseLeave={closeSoon}
        >
          <div
            className='flex items-start gap-2'
            data-reference-images-expanded
          >
            {assets.map((asset) => (
              <div className='relative shrink-0' key={asset.id}>
                {asset.kind === 'image' ? (
                  <img
                    alt={asset.name}
                    className='h-28 w-24 rounded-xl border object-cover shadow-sm'
                    src={asset.public_url}
                  />
                ) : (
                  <video
                    aria-label={asset.name}
                    className='h-28 w-24 rounded-xl border bg-black object-cover shadow-sm'
                    src={asset.public_url}
                  />
                )}
                <Button
                  aria-label={
                    asset.kind === 'image'
                      ? t('Remove image')
                      : t('Remove asset')
                  }
                  className='absolute -top-1.5 -right-1.5 rounded-full shadow-sm'
                  size='icon-xs'
                  variant='secondary'
                  onClick={() => props.onRemove(asset)}
                >
                  <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
                </Button>
              </div>
            ))}
            {imageCount(images) < props.maxImages && (
              <button
                aria-label={t('Add image')}
                className='text-muted-foreground hover:text-foreground hover:bg-muted bg-background focus-visible:ring-ring/50 flex h-28 w-24 shrink-0 items-center justify-center rounded-xl border border-dashed outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50'
                disabled={props.disabled}
                type='button'
                onClick={props.onUpload}
              >
                <HugeiconsIcon
                  className='size-6'
                  icon={Add01Icon}
                  strokeWidth={2}
                />
              </button>
            )}
          </div>
        </PopoverContent>
      </Popover>
      {topAsset && (
        <Button
          aria-label={
            topAsset.kind === 'image' ? t('Remove image') : t('Remove asset')
          }
          className='pointer-events-none absolute -top-1 right-1 z-20 rounded-full opacity-0 shadow-sm transition-opacity group-focus-within/reference:pointer-events-auto group-focus-within/reference:opacity-100 group-hover/reference:pointer-events-auto group-hover/reference:opacity-100 motion-reduce:transition-none'
          data-reference-action='remove'
          size='icon-xs'
          variant='secondary'
          onClick={(event) => {
            event.stopPropagation()
            props.onRemove(topAsset)
          }}
        >
          <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
        </Button>
      )}
      {topAsset && imageCount(images) < props.maxImages && (
        <Button
          aria-label={t('Add image')}
          className='pointer-events-none absolute right-1 -bottom-1 z-20 rounded-full opacity-0 shadow-sm transition-opacity group-focus-within/reference:pointer-events-auto group-focus-within/reference:opacity-100 group-hover/reference:pointer-events-auto group-hover/reference:opacity-100 motion-reduce:transition-none'
          data-reference-action='add'
          disabled={props.disabled}
          size='icon-xs'
          variant='secondary'
          onClick={(event) => {
            event.stopPropagation()
            props.onUpload()
          }}
        >
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
        </Button>
      )}
    </div>
  )
}

function ReferenceImageStack(props: {
  assets: WorkspaceAsset[]
  compact?: boolean
  disabled?: boolean
  emptyLabel?: string
  label?: string
  onOpen: () => void
  onUpload: () => void
}) {
  const { t } = useTranslation()
  const assets = [
    ...props.assets.filter((asset) => asset.kind === 'video').slice(0, 1),
    ...props.assets.filter((asset) => asset.kind === 'image').slice(0, 3),
  ]
  const topAsset = assets.at(-1)
  const size = props.compact ? 'size-10' : 'h-28 w-24'
  const stackSize = props.compact ? 'size-10' : 'h-28 w-[6.75rem]'

  return (
    <button
      aria-label={
        topAsset
          ? props.label || t('Reference images')
          : props.emptyLabel || t('Add image')
      }
      className={cn(
        'group relative shrink-0 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring/50',
        stackSize
      )}
      disabled={props.disabled}
      type='button'
      onClick={() => {
        if (topAsset) props.onOpen()
        else props.onUpload()
      }}
    >
      {assets
        .slice(0, -1)
        .map((asset, index) =>
          asset.kind === 'image' ? (
            <img
              alt=''
              aria-hidden='true'
              className={cn(
                'absolute top-0 left-0 rounded-xl border object-cover shadow-sm',
                size,
                index % 2 === 0
                  ? '-translate-x-1 rotate-[-4deg]'
                  : 'translate-x-1 rotate-[4deg]'
              )}
              key={asset.id}
              src={asset.public_url}
            />
          ) : (
            <video
              aria-hidden='true'
              className={cn(
                'absolute top-0 left-0 rounded-xl border bg-black object-cover shadow-sm',
                size,
                index % 2 === 0
                  ? '-translate-x-1 rotate-[-4deg]'
                  : 'translate-x-1 rotate-[4deg]'
              )}
              key={asset.id}
              src={asset.public_url}
            />
          )
        )}
      {topAsset?.kind === 'image' && (
        <img
          alt={topAsset.name}
          className={cn(
            'relative rounded-xl border object-cover shadow-md transition-transform group-hover:-translate-y-0.5 motion-reduce:transition-none',
            size
          )}
          src={topAsset.public_url}
        />
      )}
      {topAsset?.kind === 'video' && (
        <video
          aria-label={topAsset.name}
          className={cn(
            'relative rounded-xl border bg-black object-cover shadow-md transition-transform group-hover:-translate-y-0.5 motion-reduce:transition-none',
            size
          )}
          src={topAsset.public_url}
        />
      )}
      {!topAsset && (
        <span
          className={cn(
            'text-muted-foreground group-hover:text-foreground group-hover:bg-muted flex items-center justify-center rounded-xl border border-dashed bg-background',
            size
          )}
        >
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
        </span>
      )}
    </button>
  )
}

function ImageSettings(props: {
  capability: WorkspaceModelCapability
  compact?: boolean
  draft: WorkspaceDraftState
  onDraftChange: (draft: WorkspaceDraftState) => void
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const aspectRatio = props.draft.settings.aspectRatio || '1:1'
  const resolution = props.draft.settings.resolution || '2K'
  const supportedRatios = new Set(
    props.capability.aspect_ratios?.map((option) => option.value)
  )
  const supportedResolutions = new Set(
    props.capability.resolutions?.map((option) => option.value)
  )
  const changeOpen = (nextOpen: boolean) => {
    setOpen(nextOpen)
    props.onOpenChange(nextOpen)
  }
  const update = (values: Partial<WorkspaceDraftState['settings']>) => {
    props.onDraftChange({
      ...props.draft,
      settings: { ...props.draft.settings, ...values },
    })
  }

  return (
    <Popover open={open} onOpenChange={changeOpen}>
      <PopoverTrigger
        render={
          <Button
            aria-label={t('Image size settings')}
            className={cn('font-normal', props.compact && 'h-8 px-2')}
            size='sm'
            variant='outline'
          >
            <span>{aspectRatio}</span>
            <span aria-hidden='true' className='text-border'>
              |
            </span>
            <span>{resolution}</span>
            <HugeiconsIcon
              aria-hidden='true'
              className='size-3.5'
              icon={ArrowDown01Icon}
              strokeWidth={2}
            />
          </Button>
        }
      />
      <PopoverContent
        className='w-[min(22rem,calc(100vw-2rem))] gap-4 p-4'
        align='start'
        collisionPadding={12}
        side='top'
        sideOffset={8}
      >
        <fieldset className='space-y-2'>
          <legend className='text-sm font-medium'>{t('Aspect ratio')}</legend>
          <div className='grid grid-cols-4 gap-2'>
            {imageAspectRatios.map((ratio) => (
              <button
                aria-pressed={aspectRatio === ratio}
                className='hover:bg-muted aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-primary focus-visible:ring-ring/50 rounded-lg border px-2 py-1.5 text-xs outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-35'
                disabled={!supportedRatios.has(ratio)}
                key={ratio}
                type='button'
                onClick={() => update({ aspectRatio: ratio })}
              >
                {ratio}
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset className='space-y-2'>
          <legend className='text-sm font-medium'>{t('Resolution')}</legend>
          <div className='grid grid-cols-2 gap-2'>
            {imageResolutions.map((item) => (
              <button
                aria-pressed={resolution === item}
                className='hover:bg-muted aria-pressed:border-primary aria-pressed:bg-primary/10 aria-pressed:text-primary focus-visible:ring-ring/50 rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-35'
                disabled={!supportedResolutions.has(item)}
                key={item}
                type='button'
                onClick={() => update({ resolution: item })}
              >
                {item}
              </button>
            ))}
          </div>
        </fieldset>
      </PopoverContent>
    </Popover>
  )
}

function VideoOptions(props: {
  capability: WorkspaceModelCapability
  draft: WorkspaceDraftState
  onDraftChange: (draft: WorkspaceDraftState) => void
}) {
  const { t } = useTranslation()
  const settings = props.draft.settings
  const update = (
    values: Partial<WorkspaceDraftState['settings']>,
    assets = props.draft.assets
  ) =>
    props.onDraftChange({
      ...props.draft,
      settings: { ...settings, ...values },
      assets,
    })
  return (
    <div className='flex flex-wrap items-center gap-2'>
      {props.capability.modes && (
        <OptionSelect
          label={t('Mode')}
          localizeOptions
          options={props.capability.modes}
          value={settings.mode}
          onChange={(value) =>
            update(
              { mode: value },
              assetsForVideoMode(props.capability, value, props.draft.assets)
            )
          }
        />
      )}
      {props.capability.aspect_ratios && (
        <OptionSelect
          label={t('Aspect ratio')}
          options={props.capability.aspect_ratios}
          value={settings.aspectRatio}
          onChange={(value) => update({ aspectRatio: value })}
        />
      )}
      {props.capability.resolutions && (
        <OptionSelect
          label={t('Resolution')}
          options={props.capability.resolutions}
          value={settings.resolution}
          onChange={(value) => update({ resolution: value })}
        />
      )}
      {props.capability.durations && (
        <OptionSelect
          label={t('Duration')}
          options={props.capability.durations}
          value={settings.duration}
          onChange={(value) => update({ duration: value })}
        />
      )}
      {props.capability.supports_audio && (
        <label className='flex h-8 items-center gap-2 rounded-lg border px-2.5 text-sm'>
          {t('Generate audio')}
          <Switch
            checked={settings.audio ?? true}
            onCheckedChange={(checked) => update({ audio: checked })}
          />
        </label>
      )}
    </div>
  )
}

function OptionSelect(props: {
  label: string
  localizeOptions?: boolean
  options: Array<{ value: string; label: string }>
  value?: string
  onChange: (value: string) => void
}) {
  const { t } = useTranslation()
  return (
    <NativeSelect
      aria-label={props.label}
      value={props.value || ''}
      onChange={(event) => props.onChange(event.target.value)}
    >
      <NativeSelectOption value=''>{props.label}</NativeSelectOption>
      {props.options.map((option) => (
        <NativeSelectOption key={option.value} value={option.value}>
          {props.localizeOptions ? t(option.label) : option.label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  )
}

function imageCount(assets: WorkspaceAsset[]) {
  return assets.filter((asset) => asset.kind === 'image').length
}

function selectedCapability(
  type: WorkspaceType,
  model: string,
  capabilities?: WorkspaceCapabilities
) {
  if (type === 'image') {
    return capabilities?.image_models.find((item) => item.model === model)
  }
  if (type === 'video') {
    return capabilities?.video_models.find((item) => item.model === model)
  }
  return undefined
}

function confirmModelReset(
  props: WorkspaceComposerProps,
  t: ReturnType<typeof useTranslation>['t']
) {
  const clearsOptions =
    Object.keys(props.draft.settings).length > 0 ||
    props.draft.assets.length > 0
  return (
    !clearsOptions ||
    window.confirm(
      t(
        'Switching models clears incompatible settings and references. Continue?'
      )
    )
  )
}

function assetsForVideoMode(
  capability: WorkspaceModelCapability,
  mode: string,
  assets: WorkspaceAsset[]
) {
  if (capability.model !== 'doubao-seedance-2-0-260128') return assets
  const images = assets.filter((asset) => asset.kind === 'image')
  return images.slice(0, mode === 'first_last' ? 2 : 12)
}

function usesFrameReferenceSlots(
  type: WorkspaceType,
  model: string,
  mode?: string
) {
  if (type !== 'video') return false
  return model === 'kling-v3' || mode !== 'omni_reference'
}

function workspaceReferenceImageLimit(
  type: WorkspaceType,
  capability: WorkspaceModelCapability | undefined,
  mode?: string
) {
  if (type === 'image') return 3
  if (type !== 'video' || !capability) return 0
  if (
    capability.model === 'doubao-seedance-2-0-260128' &&
    mode === 'omni_reference'
  ) {
    return 12
  }
  return 2
}

function workspaceTypeLabel(type: WorkspaceType) {
  if (type === 'text') return 'Text'
  if (type === 'image') return 'Image'
  return 'Video'
}
