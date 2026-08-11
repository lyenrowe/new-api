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
const { WorkspaceComposer } = await import('../workspace-composer')

type WorkspaceDraftState = import('../types').WorkspaceDraftState

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: {
    en: {
      translation: {
        'Add image': 'Add image',
        'Aspect ratio': 'Aspect ratio',
        Balance: 'Balance',
        'Describe what you want to create': 'Describe what you want to create',
        Generate: 'Generate',
        Group: 'Group',
        Image: 'Image',
        'Image size settings': 'Image size settings',
        Model: 'Model',
        Prompt: 'Prompt',
        Provider: 'Provider',
        'Reference images': 'Reference images',
        'Remove image': 'Remove image',
        Resolution: 'Resolution',
        'Select a model': 'Select a model',
        'Select group': 'Select group',
        'Select provider': 'Select provider',
        Text: 'Text',
        Video: 'Video',
      },
    },
  },
})

const assets = [1, 2, 3].map((id) => ({
  id,
  kind: 'image' as const,
  origin: 'upload' as const,
  name: `Reference ${id}`,
  public_url: `/reference-${id}.png`,
  mime_type: 'image/png',
  size: 100,
  created_at: '2026-08-11T00:00:00Z',
}))

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
  video_models: [],
}

function ComposerHarness(props: { assetTotal?: number; compact?: boolean }) {
  const [draft, setDraft] = useState<WorkspaceDraftState>({
    model: 'gpt-image-2',
    group: 'vip',
    prompt: 'A mountain lake at dawn',
    settings: { aspectRatio: '2:3', resolution: '2K' },
    assets: assets.slice(0, props.assetTotal ?? assets.length),
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
        type='image'
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

describe('workspace composer layout', () => {
  after(() => domWindow.close())

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
