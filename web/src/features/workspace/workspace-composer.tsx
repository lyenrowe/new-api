/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import {
  AiImageIcon,
  AiVideoIcon,
  Attachment01Icon,
  Cancel01Icon,
  SentIcon,
  TextCreationIcon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

import { defaultWorkspaceSettings } from './draft-defaults'
import { workspaceGroupForModel, workspaceModelOptions } from './model-options'
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
  groups: Record<string, { desc: string; ratio: number | string }>
  assets: WorkspaceAsset[]
  balance: number
  submitting: boolean
  uploadProgress?: number
  onTypeChange: (type: WorkspaceType) => void
  onDraftChange: (draft: WorkspaceDraftState) => void
  onUpload: (kind: 'image' | 'video', file: File) => void
  onSubmit: () => void
}

const typeIcons = {
  text: TextCreationIcon,
  image: AiImageIcon,
  video: AiVideoIcon,
}

export function WorkspaceComposer(props: WorkspaceComposerProps) {
  const { t } = useTranslation()
  const fileInput = useRef<HTMLInputElement>(null)
  const videoInput = useRef<HTMLInputElement>(null)
  const [assetSearch, setAssetSearch] = useState('')
  const capability = selectedCapability(
    props.type,
    props.draft.model,
    props.capabilities
  )
  const modelOptions = workspaceModelOptions(props.type, props.capabilities)
  const selectedModel = modelOptions.find(
    (option) => option.model === props.draft.model
  )
  const vendors = [...new Set(modelOptions.map((option) => option.vendor))]
  const [vendorSelections, setVendorSelections] = useState<
    Record<WorkspaceType, string>
  >({ text: '', image: '', video: '' })
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

  return (
    <div className='bg-background/95 border-t p-3 backdrop-blur-sm'>
      <div className='mx-auto max-w-5xl space-y-3'>
        <div className='flex items-center justify-between gap-3'>
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
          <div className='flex max-w-[32rem] flex-1 items-center gap-2'>
            <NativeSelect
              aria-label={t('Provider')}
              className='min-w-32'
              value={selectedVendor}
              onChange={(event) => {
                const vendor = event.target.value
                if (!confirmModelReset(props, t)) return
                setVendorSelections((current) => ({
                  ...current,
                  [props.type]: vendor,
                }))
                props.onDraftChange({
                  ...props.draft,
                  model: '',
                  group: '',
                  settings: {},
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
              className='min-w-0 flex-1'
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
                const group = workspaceGroupForModel(
                  option,
                  props.draft.group,
                  props.groups
                )
                props.onDraftChange({
                  ...props.draft,
                  model,
                  group,
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

        {props.type !== 'text' && capability && (
          <MediaOptions
            capability={capability}
            draft={props.draft}
            onDraftChange={props.onDraftChange}
          />
        )}

        {props.draft.assets.length > 0 && (
          <div className='flex gap-2 overflow-x-auto pb-1'>
            {props.draft.assets.map((asset) => (
              <div className='group relative shrink-0' key={asset.id}>
                {asset.kind === 'image' ? (
                  <img
                    alt={asset.name}
                    className='size-16 rounded-lg border object-cover'
                    src={asset.public_url}
                  />
                ) : (
                  <video
                    aria-label={asset.name}
                    className='size-16 rounded-lg border bg-black object-cover'
                    src={asset.public_url}
                  />
                )}
                <Button
                  aria-label={t('Remove asset')}
                  className='absolute -top-1.5 -right-1.5 rounded-full'
                  size='icon-xs'
                  variant='secondary'
                  onClick={() =>
                    props.onDraftChange({
                      ...props.draft,
                      assets: props.draft.assets.filter(
                        (current) => current.id !== asset.id
                      ),
                    })
                  }
                >
                  <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
                </Button>
              </div>
            ))}
          </div>
        )}

        {props.type !== 'text' && props.assets.length > 0 && (
          <div className='space-y-2'>
            <Input
              aria-label={t('Search assets')}
              className='h-8 max-w-xs'
              placeholder={t('Search assets')}
              value={assetSearch}
              onChange={(event) => setAssetSearch(event.target.value)}
            />
            <div className='flex gap-2 overflow-x-auto pb-1'>
              {props.assets
                .filter((asset) =>
                  asset.name.toLowerCase().includes(assetSearch.toLowerCase())
                )
                .slice(0, 24)
                .map((asset) => {
                  const selected = props.draft.assets.some(
                    (current) => current.id === asset.id
                  )
                  return (
                    <button
                      aria-pressed={selected}
                      className={cn(
                        'shrink-0 rounded-lg border-2 p-0.5 outline-none focus-visible:ring-2',
                        selected ? 'border-primary' : 'border-transparent'
                      )}
                      key={asset.id}
                      type='button'
                      onClick={() => toggleAsset(props, capability, asset)}
                    >
                      {asset.kind === 'image' ? (
                        <img
                          alt={asset.name}
                          className='size-12 rounded object-cover'
                          loading='lazy'
                          src={asset.public_url}
                        />
                      ) : (
                        <video
                          aria-label={asset.name}
                          className='size-12 rounded bg-black object-cover'
                          src={asset.public_url}
                        />
                      )}
                    </button>
                  )
                })}
            </div>
          </div>
        )}

        <Textarea
          aria-label={t('Prompt')}
          className='min-h-24 resize-none rounded-xl'
          placeholder={t('Describe what you want to create')}
          value={props.draft.prompt}
          onChange={(event) =>
            props.onDraftChange({ ...props.draft, prompt: event.target.value })
          }
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
              event.preventDefault()
              if (!disabled) props.onSubmit()
            }
          }}
        />

        <div className='flex flex-wrap items-center gap-2'>
          {props.type !== 'text' && (
            <>
              <input
                ref={fileInput}
                accept='image/*'
                className='hidden'
                type='file'
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) props.onUpload('image', file)
                  event.target.value = ''
                }}
              />
              <Button
                disabled={props.uploadProgress !== undefined}
                variant='outline'
                onClick={() => fileInput.current?.click()}
              >
                <HugeiconsIcon icon={Attachment01Icon} strokeWidth={2} />
                {t('Upload image')}
              </Button>
            </>
          )}
          {props.type === 'video' && capability?.supports_video && (
            <>
              <input
                ref={videoInput}
                accept='video/*'
                className='hidden'
                type='file'
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) props.onUpload('video', file)
                  event.target.value = ''
                }}
              />
              <Button
                disabled={props.uploadProgress !== undefined}
                variant='outline'
                onClick={() => videoInput.current?.click()}
              >
                <HugeiconsIcon icon={Attachment01Icon} strokeWidth={2} />
                {t('Upload source video')}
              </Button>
            </>
          )}
          {props.uploadProgress !== undefined && (
            <span className='text-muted-foreground text-xs'>
              {t('Upload')} {props.uploadProgress}%
            </span>
          )}
          <NativeSelect
            aria-label={t('Group')}
            className='ml-auto min-w-28'
            value={props.draft.group}
            onChange={(event) =>
              props.onDraftChange({ ...props.draft, group: event.target.value })
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
          <span className='text-muted-foreground text-xs'>
            {t('Balance')}: {props.balance}
          </span>
          <Button disabled={disabled} onClick={props.onSubmit}>
            <HugeiconsIcon icon={SentIcon} strokeWidth={2} />
            {props.submitting ? t('Submitting...') : t('Generate')}
          </Button>
        </div>
      </div>
    </div>
  )
}

function MediaOptions(props: {
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
      {props.capability.qualities && (
        <OptionSelect
          label={t('Quality')}
          options={props.capability.qualities}
          value={settings.quality}
          onChange={(value) => update({ quality: value })}
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
            checked={settings.audio ?? false}
            onCheckedChange={(checked) => update({ audio: checked })}
          />
        </label>
      )}
    </div>
  )
}

function OptionSelect(props: {
  label: string
  options: Array<{ value: string; label: string }>
  value?: string
  onChange: (value: string) => void
}) {
  return (
    <NativeSelect
      aria-label={props.label}
      value={props.value || ''}
      onChange={(event) => props.onChange(event.target.value)}
    >
      <NativeSelectOption value=''>{props.label}</NativeSelectOption>
      {props.options.map((option) => (
        <NativeSelectOption key={option.value} value={option.value}>
          {option.label}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  )
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

function toggleAsset(
  props: WorkspaceComposerProps,
  capability: WorkspaceModelCapability | undefined,
  asset: WorkspaceAsset
) {
  if (props.draft.assets.some((current) => current.id === asset.id)) {
    props.onDraftChange({
      ...props.draft,
      assets: props.draft.assets.filter((current) => current.id !== asset.id),
    })
    return
  }
  if (!capability) {
    return
  }
  const selectedImages = props.draft.assets.filter(
    (current) => current.kind === 'image'
  ).length
  const selectedVideos = props.draft.assets.filter(
    (current) => current.kind === 'video'
  ).length
  if (props.type === 'image') {
    if (
      asset.kind !== 'image' ||
      selectedImages >= (capability.reference_limit || 0)
    ) {
      return
    }
  } else if (capability.model === 'kling-v3') {
    if (asset.kind !== 'image' || selectedImages >= 2) {
      return
    }
  } else if (props.draft.settings.mode === 'video_edit') {
    if (
      (asset.kind === 'video' && selectedVideos >= 1) ||
      (asset.kind === 'image' && selectedImages >= 4)
    ) {
      return
    }
  } else {
    const imageLimit = props.draft.settings.mode === 'first_last' ? 2 : 4
    if (asset.kind !== 'image' || selectedImages >= imageLimit) return
  }
  props.onDraftChange({
    ...props.draft,
    assets: [...props.draft.assets, asset],
  })
}

function assetsForVideoMode(
  capability: WorkspaceModelCapability,
  mode: string,
  assets: WorkspaceAsset[]
) {
  if (capability.model !== 'doubao-seedance-2-0-260128') return assets
  const images = assets.filter((asset) => asset.kind === 'image')
  if (mode === 'video_edit') {
    const video = assets.find((asset) => asset.kind === 'video')
    return [...(video ? [video] : []), ...images.slice(0, 4)]
  }
  return images.slice(0, mode === 'first_last' ? 2 : 4)
}

function workspaceTypeLabel(type: WorkspaceType) {
  if (type === 'text') return 'Text'
  if (type === 'image') return 'Image'
  return 'Video'
}
