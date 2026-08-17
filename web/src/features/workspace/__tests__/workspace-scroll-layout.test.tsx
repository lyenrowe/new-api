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

const domWindow = new Window()
for (const key of [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'Node',
  'Element',
  'Event',
  'WheelEvent',
  'ResizeObserver',
] as const) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: domWindow[key],
  })
}

const resizeObservers: TestResizeObserver[] = []

class TestResizeObserver {
  callback: ResizeObserverCallback
  target?: Element

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback
    resizeObservers.push(this)
  }

  observe(target: Element) {
    this.target = target
  }

  disconnect() {}

  unobserve() {}

  trigger() {
    if (!this.target) return
    this.callback(
      [
        {
          contentRect: this.target.getBoundingClientRect(),
          target: this.target,
        } as ResizeObserverEntry,
      ],
      this as unknown as ResizeObserver
    )
  }
}

Object.defineProperty(globalThis, 'ResizeObserver', {
  configurable: true,
  value: TestResizeObserver,
})

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  configurable: true,
  writable: true,
  value: true,
})

const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { isWorkspaceComposerCompact } =
  await import('../workspace-composer-state')
const { WorkspaceScrollLayout } = await import('../workspace-scroll-layout')

describe('workspace scroll layout', () => {
  after(() => domWindow.close())

  test('derives compact mode only when away from latest and not interacting', () => {
    assert.equal(isWorkspaceComposerCompact(true, true), false)
    assert.equal(isWorkspaceComposerCompact(true, false), false)
    assert.equal(isWorkspaceComposerCompact(false, true), false)
    assert.equal(isWorkspaceComposerCompact(false, false), true)
  })

  test('floats the composer without changing the scroll viewport height', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <WorkspaceScrollLayout
          composer={<div>Composer</div>}
          onAtLatestChange={() => {}}
          onScrollAwayFromComposer={() => {}}
        >
          <div>Last round</div>
        </WorkspaceScrollLayout>
      )
    })

    const viewport = container.querySelector('[data-workspace-scroll-viewport]')
    const dock = container.querySelector('[data-workspace-composer-dock]')
    assert.ok(viewport)
    assert.ok(dock)
    assert.equal(viewport.contains(dock), false)
    assert.equal(viewport.parentElement, dock.parentElement)
    assert.equal(dock.classList.contains('absolute'), true)
    assert.equal(dock.classList.contains('pointer-events-none'), true)
    assert.equal(dock.classList.contains('max-h-[50svh]'), true)

    const composer = container.querySelector(
      '[data-workspace-composer-interaction]'
    )
    const clearance = container.querySelector(
      '[data-workspace-composer-clearance]'
    )
    assert.ok(composer)
    assert.ok(clearance)
    assert.equal(composer.classList.contains('pointer-events-auto'), true)

    await act(async () => root.unmount())
  })

  test('blurs the composer when scrolling upward outside it', async () => {
    const container = document.createElement('div')
    document.body.append(container)
    const root = createRoot(container)
    let scrollAwayCount = 0

    await act(async () => {
      root.render(
        <WorkspaceScrollLayout
          composer={<input aria-label='Prompt' />}
          onAtLatestChange={() => {}}
          onScrollAwayFromComposer={() => {
            scrollAwayCount += 1
          }}
        >
          <div>Last round</div>
        </WorkspaceScrollLayout>
      )
    })

    const input = container.querySelector<HTMLInputElement>('input')
    const viewport = container.querySelector<HTMLElement>(
      '[data-workspace-scroll-viewport]'
    )
    assert.ok(input)
    assert.ok(viewport)
    await act(async () => input.focus())
    assert.equal(document.activeElement, input)

    await act(async () => {
      viewport.dispatchEvent(
        new WheelEvent('wheel', { bubbles: true, deltaY: -10 })
      )
    })

    assert.equal(document.activeElement, document.body)
    assert.equal(scrollAwayCount, 1)

    await act(async () => root.unmount())
    container.remove()
  })

  test('shrinks the message clearance with the compact composer', async () => {
    const originalRect = HTMLElement.prototype.getBoundingClientRect
    let dockHeight = 280
    HTMLElement.prototype.getBoundingClientRect = function () {
      if (this.hasAttribute('data-workspace-composer-dock')) {
        return {
          bottom: dockHeight,
          height: dockHeight,
          left: 0,
          right: 0,
          top: 0,
          width: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        }
      }
      return originalRect.call(this)
    }
    const container = document.createElement('div')
    const root = createRoot(container)

    try {
      await act(async () => {
        root.render(
          <WorkspaceScrollLayout
            composer={<div>Expanded composer</div>}
            onAtLatestChange={() => {}}
            onScrollAwayFromComposer={() => {}}
          >
            <div>Last round</div>
          </WorkspaceScrollLayout>
        )
      })
      const dock = container.querySelector('[data-workspace-composer-dock]')
      const clearance = container.querySelector<HTMLElement>(
        '[data-workspace-composer-clearance]'
      )
      assert.ok(dock)
      assert.equal(clearance?.style.height, '280px')

      dockHeight = 72
      const dockObserver = resizeObservers.find(
        (observer) => observer.target === dock
      )
      assert.ok(dockObserver)
      await act(async () => dockObserver.trigger())
      assert.equal(clearance?.style.height, '72px')
    } finally {
      HTMLElement.prototype.getBoundingClientRect = originalRect
      await act(async () => root.unmount())
    }
  })
})
