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

import type { ShowcaseCase } from '../types'

const domWindow = new Window({ url: 'http://localhost/' })
const domGlobals = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLButtonElement',
  'HTMLImageElement',
  'HTMLVideoElement',
  'SVGElement',
  'Node',
  'Element',
  'Event',
  'MouseEvent',
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

const { act, useState } = await import('react')
const { createRoot } = await import('react-dom/client')
const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')
const { createRootRoute, createRouter, RouterProvider } =
  await import('@tanstack/react-router')
const { PreviewDialog } = await import('../showcase-page')

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: {
    en: {
      translation: {
        Back: 'Back',
        'Full preview': 'Full preview',
        'Generation preset': 'Generation preset',
        'Image prompt': 'Image prompt',
        'Open in workspace': 'Open in workspace',
        'Other cases': 'Other cases',
        Size: 'Size',
        'Video prompt': 'Video prompt',
      },
    },
  },
})

const cases: ShowcaseCase[] = [
  {
    id: 1,
    title: 'Forest city',
    type: 'image',
    category_id: 1,
    cover_url: '/forest.webp',
    prompt: 'A forest city built around ancient trees.',
    size: '2304x1728',
    model: 'Image Model',
    featured: true,
    published: true,
    sort_order: 1,
  },
  {
    id: 2,
    title: 'Ocean journey',
    type: 'video',
    category_id: 1,
    cover_url: '/ocean.webp',
    media_url: '/ocean.mp4',
    prompt: 'A cinematic journey across the ocean.',
    aspect_ratio: '16:9',
    duration: 10,
    model: 'Video Model',
    featured: false,
    published: true,
    sort_order: 2,
  },
]

const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

function PreviewHarness() {
  const [item, setItem] = useState(cases[0])

  return (
    <I18nextProvider i18n={i18n}>
      <PreviewDialog
        item={item}
        items={cases}
        onOpenChange={() => {}}
        onSelect={setItem}
      />
    </I18nextProvider>
  )
}

const rootRoute = createRootRoute({ component: PreviewHarness })
const router = createRouter({ routeTree: rootRoute })

describe('creative showcase full-screen preview', () => {
  after(() => {
    domWindow.close()
  })

  test('renders media, details, and related-case panes with the current case highlighted', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => root.render(<RouterProvider router={router} />))

    assert.equal(
      document.querySelectorAll('[data-showcase-preview-pane]').length,
      3
    )
    assert.ok(document.querySelector('img[alt="Forest city"]'))
    assert.equal(document.body.textContent?.includes('Image Model'), true)
    assert.equal(
      document.body.textContent?.includes(
        'A forest city built around ancient trees.'
      ),
      true
    )
    assert.equal(
      document
        .querySelector('button[aria-label="Forest city"]')
        ?.getAttribute('aria-pressed'),
      'true'
    )

    await act(async () => root.unmount())
    container.remove()
  })

  test('switches the media player and metadata when another case is selected', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)

    await act(async () => root.render(<RouterProvider router={router} />))

    const oceanButton = document.querySelector<HTMLButtonElement>(
      'button[aria-label="Ocean journey"]'
    )
    assert.ok(oceanButton)
    await act(async () => oceanButton.click())

    const video = document.querySelector<HTMLVideoElement>('video')
    assert.ok(video)
    assert.equal(video.getAttribute('src'), '/ocean.mp4')
    assert.equal(document.body.textContent?.includes('Video Model'), true)
    assert.equal(oceanButton.getAttribute('aria-pressed'), 'true')

    await act(async () => root.unmount())
    container.remove()
  })
})
