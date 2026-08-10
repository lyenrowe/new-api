/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import assert from 'node:assert/strict'
import test from 'node:test'

import type { PricingData } from '../../pricing/types'
import {
  workspaceFirstModelForVendor,
  workspaceGroupForModel,
  workspaceModelOptions,
} from '../model-options'
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

test('uses the pricing catalog vendor relationship instead of capability fallback', () => {
  const mismatchedCapabilities: WorkspaceCapabilities = {
    ...capabilities,
    text_models: [
      ...capabilities.text_models,
      { model: 'gamma', vendor: 'openai', groups: ['default'] },
    ],
  }
  const pricing = {
    data: [
      { model_name: 'alpha', vendor_id: 2 },
      { model_name: 'beta', vendor_id: 1 },
    ],
    vendors: [
      { id: 1, name: 'OpenAI' },
      { id: 2, name: 'ByteDance' },
    ],
  } as PricingData

  const options = workspaceModelOptions('text', mismatchedCapabilities, pricing)

  assert.deepEqual(options, [
    { model: 'alpha', vendor: 'ByteDance', groups: ['default', 'vip'] },
    { model: 'beta', vendor: 'OpenAI', groups: ['vip'] },
    { model: 'gamma', vendor: 'Custom', groups: ['default'] },
  ])
  assert.equal(workspaceFirstModelForVendor(options, 'OpenAI')?.model, 'beta')
})

test('keeps a supported group and otherwise selects the first available model group', () => {
  const option = workspaceModelOptions('text', capabilities)[0]
  const groups = { default: {}, vip: {} }

  assert.equal(workspaceGroupForModel(option, 'vip', groups), 'vip')
  assert.equal(workspaceGroupForModel(option, 'removed', groups), 'default')
  assert.equal(workspaceGroupForModel(option, 'removed', { vip: {} }), 'vip')
  assert.equal(workspaceGroupForModel(option, 'removed', {}), '')
})
