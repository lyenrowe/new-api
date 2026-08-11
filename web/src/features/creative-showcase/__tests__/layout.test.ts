/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { showcaseContentTypes, showcaseCreationTools } from '../showcase-layout'

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
})
