/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import assert from 'node:assert/strict'
import { test } from 'node:test'

import { normalizeWorkspaceDraft } from '../draft-defaults'
import type { WorkspaceAsset, WorkspaceDraftState } from '../types'

const assets: WorkspaceAsset[] = [
  {
    id: 1,
    kind: 'video',
    origin: 'upload',
    name: 'Legacy video',
    public_url: '/legacy.mp4',
    mime_type: 'video/mp4',
    size: 100,
    created_at: '2026-08-11T00:00:00Z',
  },
  ...[2, 3, 4].map((id) => ({
    id,
    kind: 'image' as const,
    origin: 'upload' as const,
    name: `Reference ${id}`,
    public_url: `/reference-${id}.png`,
    mime_type: 'image/png',
    size: 100,
    created_at: '2026-08-11T00:00:00Z',
  })),
]

test('normalizes a legacy Seedance video-edit draft to optional frame inputs', () => {
  const draft: WorkspaceDraftState = {
    model: 'doubao-seedance-2-0-260128',
    group: 'vip',
    prompt: 'Orbit',
    settings: { mode: 'video_edit' },
    assets,
  }

  const normalized = normalizeWorkspaceDraft(draft)

  assert.equal(normalized.settings.mode, 'first_last')
  assert.equal(normalized.settings.audio, true)
  assert.deepEqual(
    normalized.assets.map((asset) => asset.id),
    [2, 3]
  )
})

test('preserves an explicit disabled-audio choice for Kling', () => {
  const draft: WorkspaceDraftState = {
    model: 'kling-v3',
    group: 'vip',
    prompt: 'Orbit',
    settings: { audio: false, mode: 'pro' },
    assets,
  }

  const normalized = normalizeWorkspaceDraft(draft)

  assert.equal(normalized.settings.audio, false)
  assert.equal(normalized.settings.mode, 'pro')
  assert.deepEqual(
    normalized.assets.map((asset) => asset.id),
    [2, 3]
  )
})
