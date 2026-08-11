/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { resolveWorkspaceEntryType } from '../workspace-entry'

describe('workspace entry type', () => {
  test('prefers an explicit creation-tool type over the saved conversation type', () => {
    assert.equal(resolveWorkspaceEntryType('text', 'video'), 'text')
    assert.equal(resolveWorkspaceEntryType('image', 'text'), 'image')
    assert.equal(resolveWorkspaceEntryType('video', 'image'), 'video')
  })

  test('restores the saved conversation type when no entry type is provided', () => {
    assert.equal(resolveWorkspaceEntryType(undefined, 'video'), 'video')
    assert.equal(resolveWorkspaceEntryType(), 'text')
  })
})
