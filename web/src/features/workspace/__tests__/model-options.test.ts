/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import assert from 'node:assert/strict'
import test from 'node:test'

import { workspaceGroupForModel, workspaceModelOptions } from '../model-options'
import type { WorkspaceCapabilities } from '../types'

const capabilities: WorkspaceCapabilities = {
  text_models: [
    { model: 'alpha', vendor: 'Vendor A', groups: ['default', 'vip'] },
    { model: 'beta', vendor: 'Vendor B', groups: ['vip'] },
  ],
  image_models: [],
  video_models: [],
}

test('returns vendor-aware text model options from workspace capabilities', () => {
  assert.deepEqual(workspaceModelOptions('text', capabilities), [
    { model: 'alpha', vendor: 'Vendor A', groups: ['default', 'vip'] },
    { model: 'beta', vendor: 'Vendor B', groups: ['vip'] },
  ])
})

test('keeps a supported group and otherwise selects the first available model group', () => {
  const option = workspaceModelOptions('text', capabilities)[0]
  const groups = { default: {}, vip: {} }

  assert.equal(workspaceGroupForModel(option, 'vip', groups), 'vip')
  assert.equal(workspaceGroupForModel(option, 'removed', groups), 'default')
  assert.equal(workspaceGroupForModel(option, 'removed', { vip: {} }), 'vip')
  assert.equal(workspaceGroupForModel(option, 'removed', {}), '')
})
