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
  'HTMLImageElement',
  'SVGElement',
  'Node',
  'Element',
  'Event',
] as const) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: domWindow[key],
  })
}

Object.defineProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT', {
  configurable: true,
  writable: true,
  value: true,
})

const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { createInstance } = await import('i18next')
const { I18nextProvider, initReactI18next } = await import('react-i18next')
const { RoundList } = await import('../round-list')

const i18n = createInstance()
await i18n.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: { Tokens: 'Tokens', Cost: 'Cost' } } },
})

describe('workspace round usage', () => {
  after(() => domWindow.close())

  test('shows persisted tokens and billed cost in the round header', async () => {
    const container = document.createElement('div')
    const root = createRoot(container)

    await act(async () => {
      root.render(
        <I18nextProvider i18n={i18n}>
          <RoundList
            rounds={[
              {
                id: 1,
                conversation_id: '7a7d8d8d-c9a0-4c2d-bfd4-fdb4f6c415d8',
                type: 'image',
                model: 'gpt-image-2',
                group: 'default',
                prompt: 'Portrait',
                settings: '{}',
                asset_ids: '[]',
                status: 'succeeded',
                output: '{"data":[{"url":"/portrait.png"}]}',
                token_count: 6_840,
                quota: 10_951,
                created_at: '2026-08-17T00:00:00Z',
                updated_at: '2026-08-17T00:00:01Z',
              },
            ]}
            streamingText=''
            onEdit={() => {}}
            onRetry={() => {}}
          />
        </I18nextProvider>
      )
    })

    const usage = container.querySelector('[data-workspace-round-usage]')
    assert.ok(usage)
    assert.equal(usage.textContent?.includes('Tokens: 6,840'), true)
    assert.equal(usage.textContent?.includes('Cost: $0.021902'), true)

    await act(async () => root.unmount())
  })
})
