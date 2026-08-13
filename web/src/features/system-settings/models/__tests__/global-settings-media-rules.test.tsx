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
const domGlobals = [
  'window',
  'document',
  'navigator',
  'HTMLElement',
  'HTMLInputElement',
  'HTMLTextAreaElement',
  'SVGElement',
  'Node',
  'Element',
  'Event',
  'CustomEvent',
  'MutationObserver',
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

const { act } = await import('react')
const { createRoot } = await import('react-dom/client')
const { QueryClient, QueryClientProvider } =
  await import('@tanstack/react-query')
const i18next = (await import('i18next')).default
const { I18nextProvider, initReactI18next } = await import('react-i18next')
const { GlobalSettingsCard } = await import('../global-settings-card')

await i18next.use(initReactI18next).init({
  lng: 'en',
  resources: { en: { translation: {} } },
})

const reactTestGlobals = globalThis as typeof globalThis & {
  IS_REACT_ACT_ENVIRONMENT?: boolean
}
reactTestGlobals.IS_REACT_ACT_ENVIRONMENT = true

const defaultValues = {
  global: {
    pass_through_request_enabled: false,
    thinking_model_blacklist: '[]',
    chat_completions_to_responses_policy: '{}',
    workspace_model_media_rules:
      '[{"type":"video","pattern":"(^|/)custom-video"}]',
  },
  general_setting: {
    ping_interval_enabled: false,
    ping_interval_seconds: 60,
  },
}

async function renderCard() {
  const container = document.createElement('div')
  document.body.append(container)
  const root = createRoot(container)
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  })

  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18next}>
          <GlobalSettingsCard defaultValues={defaultValues} />
        </I18nextProvider>
      </QueryClientProvider>
    )
  })

  return { container, root, queryClient }
}

describe('workspace model media rule settings', () => {
  after(() => {
    domWindow.close()
  })

  test('loads saved rules and fills the documented example', async () => {
    const rendered = await renderCard()
    const textarea = rendered.container.querySelector<HTMLTextAreaElement>(
      'textarea[name="global.workspace_model_media_rules"]'
    )
    assert.ok(textarea)
    assert.equal(
      textarea.value,
      defaultValues.global.workspace_model_media_rules
    )

    const fillButton = [...rendered.container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Fill media rule example'
    )
    assert.ok(fillButton)
    await act(async () => fillButton.click())

    assert.match(textarea.value, /"type": "unknown"/)
    assert.match(textarea.value, /wan2\\\\\.7/)

    await act(async () => rendered.root.unmount())
    rendered.container.remove()
    rendered.queryClient.clear()
  })

  test('rejects JSON that is not an ordered rule array', async () => {
    const rendered = await renderCard()
    const textarea = rendered.container.querySelector<HTMLTextAreaElement>(
      'textarea[name="global.workspace_model_media_rules"]'
    )
    const form = rendered.container.querySelector('form')
    assert.ok(textarea)
    assert.ok(form)

    await act(async () => {
      textarea.value = '{}'
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
      textarea.dispatchEvent(new Event('blur', { bubbles: true }))
      form.dispatchEvent(
        new Event('submit', { bubbles: true, cancelable: true })
      )
    })
    await act(async () => {
      await Promise.resolve()
    })

    const message = [
      ...rendered.container.querySelectorAll('[data-slot="form-message"]'),
    ]
      .map((element) => element.textContent)
      .find((text) => text === 'Invalid workspace model media rules')
    assert.equal(message, 'Invalid workspace model media rules')

    await act(async () => rendered.root.unmount())
    rendered.container.remove()
    rendered.queryClient.clear()
  })
})
