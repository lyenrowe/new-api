/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import assert from 'node:assert/strict'
import { after, describe, test } from 'node:test'

import { Window } from 'happy-dom'

const domWindow = new Window({ url: 'http://localhost/' })
const domGlobals = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLButtonElement',
  'HTMLImageElement',
  'SVGElement',
  'Node',
  'Element',
  'Event',
  'MouseEvent',
  'KeyboardEvent',
  'PointerEvent',
  'CustomEvent',
  'MutationObserver',
  'ResizeObserver',
  'requestAnimationFrame',
  'cancelAnimationFrame',
  'getComputedStyle',
] as const

for (const key of domGlobals) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: domWindow[key],
  })
}

const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

const { act, useState } = await import('react')
const { createRoot } = await import('react-dom/client')
const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')
const { defaultWorkspaceSettings } = await import('../draft-defaults')
const { WorkspaceComposer } = await import('../workspace-composer')

type WorkspaceDraftState = import('../types').WorkspaceDraftState
type WorkspaceType = import('../types').WorkspaceType

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: {
    en: {
      translation: {
        'Add image': 'Add image',
        'Add first frame': 'Add first frame',
        'Add last frame': 'Add last frame',
        'Aspect ratio': 'Aspect ratio',
        Balance: 'Balance',
        'Describe what you want to create': 'Describe what you want to create',
        Generate: 'Generate',
        'Generate audio': 'Generate audio',
        Group: 'Group',
        Image: 'Image',
        'Image size settings': 'Image size settings',
        Model: 'Model',
        Mode: 'Mode',
        'First frame': 'First frame',
        'First and last frame': 'First and last frame',
        'Last frame': 'Last frame',
        'Omni reference': 'Omni reference',
        Professional: 'Professional',
        Prompt: 'Prompt',
        Provider: 'Provider',
        'Reference images': 'Reference images',
        'Reference content': 'Reference content',
        'Remove first frame': 'Remove first frame',
        'Remove image': 'Remove image',
        'Remove last frame': 'Remove last frame',
        Resolution: 'Resolution',
        'Select a model': 'Select a model',
        'Select group': 'Select group',
        'Select provider': 'Select provider',
        Standard: 'Standard',
        Text: 'Text',
        Video: 'Video',
      },
    },
  },
})

const assets = Array.from({ length: 13 }, (_, index) => index + 1).map(
  (id) => ({
    id,
    kind: 'image' as const,
    origin: 'upload' as const,
    name: `Reference ${id}`,
    public_url: `/reference-${id}.png`,
    mime_type: 'image/png',
    size: 100,
    created_at: '2026-08-11T00:00:00Z',
  })
)

const capabilities: import('../types').WorkspaceCapabilities = {
  text_models: [],
  image_models: [
    {
      model: 'gpt-image-2',
      vendor: 'OpenAI',
      type: 'image',
      groups: ['vip'],
      reference_limit: 16,
      resolutions: [
        { value: '2K', label: '2K' },
        { value: '4K', label: '4K' },
      ],
      aspect_ratios: [
        { value: '1:1', label: '1:1' },
        { value: '2:3', label: '2:3' },
      ],
    },
  ],
  video_models: [
    {
      model: 'doubao-seedance-2-0-260128',
      vendor: 'ByteDance',
      type: 'video',
      groups: ['vip'],
      reference_limit: 12,
      resolutions: [{ value: '720p', label: '720p' }],
      aspect_ratios: [{ value: '16:9', label: '16:9' }],
      modes: [
        { value: 'first_last', label: 'First and last frame' },
        { value: 'omni_reference', label: 'Omni reference' },
      ],
      durations: [{ value: '5', label: '5s' }],
      supports_audio: true,
      supports_frames: true,
    },
    {
      model: 'kling-v3',
      vendor: 'Kling',
      type: 'video',
      groups: ['vip'],
      reference_limit: 2,
      aspect_ratios: [{ value: '16:9', label: '16:9' }],
      modes: [
        { value: 'std', label: 'Standard' },
        { value: 'pro', label: 'Professional' },
      ],
      durations: [{ value: '5', label: '5s' }],
      supports_audio: true,
      supports_frames: true,
    },
  ],
}

function ComposerHarness(props: {
  assetTotal?: number
  compact?: boolean
  mode?: string
  model?: string
  type?: WorkspaceType
}) {
  const type = props.type || 'image'
  const model = props.model || 'gpt-image-2'
  const [draft, setDraft] = useState<WorkspaceDraftState>({
    model,
    group: 'vip',
    prompt: 'A mountain lake at dawn',
    settings:
      type === 'video'
        ? {
            aspectRatio: '16:9',
            audio: true,
            duration: '5',
            mode: props.mode || (model === 'kling-v3' ? 'std' : 'first_last'),
            resolution:
              model === 'doubao-seedance-2-0-260128' ? '720p' : undefined,
          }
        : { aspectRatio: '2:3', resolution: '2K' },
    assets: assets.slice(0, props.assetTotal ?? 3),
  })
  return (
    <I18nextProvider i18n={i18n}>
      <WorkspaceComposer
        balance={1200}
        capabilities={capabilities}
        compact={props.compact ?? false}
        draft={draft}
        groups={{ vip: { desc: 'VIP', ratio: 1 } }}
        submitting={false}
        type={type}
        onDraftChange={setDraft}
        onExpand={() => {}}
        onInteractionChange={() => {}}
        onSubmit={() => {}}
        onTypeChange={() => {}}
        onUpload={() => {}}
      />
    </I18nextProvider>
  )
}

async function renderComposer(compact = false, assetTotal = assets.length) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () =>
    root.render(<ComposerHarness assetTotal={assetTotal} compact={compact} />)
  )
  return { container, root }
}

async function renderVideoComposer(props: {
  assetTotal?: number
  mode?: string
  model: string
}) {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  await act(async () =>
    root.render(
      <ComposerHarness
        assetTotal={props.assetTotal ?? 0}
        mode={props.mode}
        model={props.model}
        type='video'
      />
    )
  )
  return { container, root }
}

describe('workspace composer layout', () => {
  test('reserves one reference slot while rendering uploaded images as a stack', async () => {
    const rendered = await renderComposer()
    const editor = rendered.container.querySelector(
      '[data-workspace-editor-layout]'
    )
    const slot = rendered.container.querySelector('[data-reference-slot]')
    const trigger = rendered.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Reference images"]'
    )

    assert.ok(editor?.className.includes('grid-cols-[6.75rem_minmax(0,1fr)]'))
    assert.equal(slot?.getAttribute('data-reference-slot'), 'single')
    assert.equal(trigger?.querySelectorAll('img').length, 3)
    assert.equal(trigger?.querySelectorAll('img[aria-hidden="true"]').length, 2)
    assert.equal(trigger?.querySelectorAll('img:not([aria-hidden])').length, 1)
    assert.equal(rendered.container.querySelector('input[type="search"]'), null)
    assert.equal(rendered.container.textContent?.includes('Quality'), false)

    await act(async () => rendered.root.unmount())
    rendered.container.remove()
  })

  test('opens all three references without adding layout width and closes on Escape', async () => {
    const rendered = await renderComposer()
    const trigger = rendered.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Reference images"]'
    )
    assert.ok(trigger)

    await act(async () => trigger.click())
    const expanded = document.querySelector('[data-reference-images-expanded]')
    assert.ok(expanded)
    assert.equal(
      expanded.querySelectorAll('button[aria-label="Remove image"]').length,
      3
    )
    assert.equal(expanded.querySelector('button[aria-label="Add image"]'), null)

    await act(async () => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })
      )
    })
    assert.equal(
      document.querySelector('[data-reference-images-expanded]'),
      null
    )

    await act(async () => rendered.root.unmount())
    rendered.container.remove()
  })

  test('reveals add and remove actions on image hover and removes the top image', async () => {
    const rendered = await renderComposer(false, 2)
    const slot = rendered.container.querySelector<HTMLElement>(
      '[data-reference-slot]'
    )
    const add = rendered.container.querySelector<HTMLButtonElement>(
      '[data-reference-action="add"]'
    )
    const remove = rendered.container.querySelector<HTMLButtonElement>(
      '[data-reference-action="remove"]'
    )
    assert.ok(slot)
    assert.ok(add?.className.includes('group-hover/reference:opacity-100'))
    if (!remove) assert.fail('Expected a remove action')
    assert.ok(remove.className.includes('group-hover/reference:opacity-100'))

    await act(async () => {
      slot.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    })
    assert.ok(document.querySelector('[data-reference-images-expanded]'))

    await act(async () => remove.click())
    const trigger = rendered.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Reference images"]'
    )
    assert.equal(
      trigger?.querySelector<HTMLImageElement>('img:not([aria-hidden])')?.alt,
      'Reference 1'
    )

    await act(async () => rendered.root.unmount())
    rendered.container.remove()
  })

  test('keeps the prompt summary, image settings, and generate action when compact', async () => {
    const rendered = await renderComposer(true)

    assert.equal(rendered.container.querySelector('textarea'), null)
    assert.ok(
      rendered.container.textContent?.includes('A mountain lake at dawn')
    )
    assert.ok(
      rendered.container.querySelector(
        'button[aria-label="Image size settings"]'
      )
    )
    assert.ok(rendered.container.querySelector('button[aria-label="Generate"]'))

    await act(async () => rendered.root.unmount())
    rendered.container.remove()
  })

  test('updates ratio and resolution through one accessible size popover', async () => {
    const rendered = await renderComposer()
    const settings = rendered.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Image size settings"]'
    )
    assert.ok(settings)

    await act(async () => settings.click())
    const aspectOptions = document.querySelectorAll(
      'fieldset:first-of-type button'
    )
    const resolutionOptions = document.querySelectorAll(
      'fieldset:last-of-type button'
    )
    assert.equal(aspectOptions.length, 8)
    assert.equal(resolutionOptions.length, 2)
    assert.equal(
      [...aspectOptions]
        .find((item) => item.textContent === '2:3')
        ?.getAttribute('aria-pressed'),
      'true'
    )
    assert.equal(
      [...resolutionOptions]
        .find((item) => item.textContent === '2K')
        ?.getAttribute('aria-pressed'),
      'true'
    )

    const fourK = [...resolutionOptions].find(
      (item): item is HTMLButtonElement => item.textContent === '4K'
    )
    assert.ok(fourK)
    await act(async () => fourK.click())
    assert.ok(settings.textContent?.includes('2:3'))
    assert.ok(settings.textContent?.includes('4K'))

    await act(async () => rendered.root.unmount())
    rendered.container.remove()
  })
})

describe('workspace video references', () => {
  test('defaults Seedance to optional frame slots with audio enabled', async () => {
    const seedance = capabilities.video_models[0]
    const defaults = defaultWorkspaceSettings(seedance)
    assert.equal(defaults.mode, 'first_last')
    assert.equal(defaults.audio, true)

    const rendered = await renderVideoComposer({
      model: 'doubao-seedance-2-0-260128',
    })
    const first = rendered.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Add first frame"]'
    )
    const last = rendered.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Add last frame"]'
    )
    const mode = rendered.container.querySelector<HTMLSelectElement>(
      'select[aria-label="Mode"]'
    )
    const audio =
      rendered.container.querySelector<HTMLElement>('[role="switch"]')

    assert.equal(first?.disabled, false)
    assert.equal(last?.disabled, true)
    assert.deepEqual(
      [...(mode?.options || [])].map((option) => option.value),
      ['', 'first_last', 'omni_reference']
    )
    assert.equal(audio?.getAttribute('aria-checked'), 'true')
    assert.equal(
      rendered.container.textContent?.includes('Upload source video'),
      false
    )

    await act(async () => rendered.root.unmount())
    rendered.container.remove()
  })

  test('enables the last frame after a first frame and clears both when first is removed', async () => {
    const rendered = await renderVideoComposer({
      assetTotal: 2,
      model: 'doubao-seedance-2-0-260128',
    })
    const removeFirst = rendered.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Remove first frame"]'
    )
    assert.ok(removeFirst)
    assert.ok(
      rendered.container.querySelector('button[aria-label="Remove last frame"]')
    )

    await act(async () => removeFirst.click())
    assert.ok(
      rendered.container.querySelector('button[aria-label="Add first frame"]')
    )
    assert.equal(
      rendered.container.querySelector<HTMLButtonElement>(
        'button[aria-label="Add last frame"]'
      )?.disabled,
      true
    )

    await act(async () => rendered.root.unmount())
    rendered.container.remove()
  })

  test('shows all twelve Seedance omni references without an extra upload slot', async () => {
    const rendered = await renderVideoComposer({
      assetTotal: 12,
      mode: 'omni_reference',
      model: 'doubao-seedance-2-0-260128',
    })
    const trigger = rendered.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Reference content"]'
    )
    assert.ok(trigger)

    await act(async () => trigger.click())
    const expanded = document.querySelector('[data-reference-images-expanded]')
    assert.equal(
      expanded?.querySelectorAll('button[aria-label="Remove image"]').length,
      12
    )
    assert.equal(
      expanded?.querySelector('button[aria-label="Add image"]'),
      null
    )

    await act(async () => rendered.root.unmount())
    rendered.container.remove()
  })

  test('keeps Kling modes while exposing optional first and last frames', async () => {
    const rendered = await renderVideoComposer({ model: 'kling-v3' })
    const mode = rendered.container.querySelector<HTMLSelectElement>(
      'select[aria-label="Mode"]'
    )

    assert.deepEqual(
      [...(mode?.options || [])].map((option) => option.value),
      ['', 'std', 'pro']
    )
    assert.ok(
      rendered.container.querySelector('button[aria-label="Add first frame"]')
    )
    assert.equal(
      rendered.container.querySelector<HTMLButtonElement>(
        'button[aria-label="Add last frame"]'
      )?.disabled,
      true
    )

    await act(async () => rendered.root.unmount())
    rendered.container.remove()
  })
})

after(() => domWindow.close())
