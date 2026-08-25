/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  showcaseContentTypes,
  showcaseCreationTools,
  showcaseLayoutClasses,
} from '../showcase-layout'

describe('creative showcase layout', () => {
  test('labels content filters as cases instead of generation actions', () => {
    assert.deepEqual(
      showcaseContentTypes.map((item) => item.labelKey),
      ['Image cases', 'Video cases']
    )
  })

  test('exposes text, image, and video creation entries', () => {
    assert.deepEqual(
      showcaseCreationTools.map((item) => item.labelKey),
      ['Text generation', 'Image generation', 'Video generation']
    )
    assert.equal(
      showcaseCreationTools.every((item) => item.href === '/workspace'),
      true
    )
    assert.deepEqual(
      showcaseCreationTools.map((item) => item.search.type),
      ['text', 'image', 'video']
    )
  })

  test('uses the shared header with a compact, theme-aware showcase hero', () => {
    assert.equal('header' in showcaseLayoutClasses, false)
    assert.match(showcaseLayoutClasses.background, /\btop-16\b/)
    assert.match(showcaseLayoutClasses.background, /\bh-\[360px\]/)
    assert.match(showcaseLayoutClasses.background, /\bdark:opacity-\[0\.10\]/)
    assert.match(showcaseLayoutClasses.hero, /\blg:pb-6\b/)
    assert.doesNotMatch(showcaseLayoutClasses.hero, /\blg:py-14\b/)
    assert.match(showcaseLayoutClasses.toolbar, /\bitems-center\b/)
    assert.match(showcaseLayoutClasses.toolbar, /\bpy-4\b/)
  })
})
