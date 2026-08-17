/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import type { WorkspaceConversation } from '../types'
import { resolveWorkspaceConversationAfterDelete } from '../workspace-conversation-selection'

const conversations = [1, 2, 3].map(
  (id): WorkspaceConversation => ({
    id,
    title: `Conversation ${id}`,
    active_type: 'text',
    created_at: '2026-08-17T00:00:00Z',
    updated_at: '2026-08-17T00:00:00Z',
  })
)

describe('workspace conversation selection after deletion', () => {
  test('keeps the current conversation when deleting another history item', () => {
    assert.equal(
      resolveWorkspaceConversationAfterDelete(conversations, 1, 2),
      1
    )
  })

  test('selects a remaining conversation when deleting the current item', () => {
    assert.equal(
      resolveWorkspaceConversationAfterDelete(conversations, 1, 1),
      2
    )
  })

  test('returns no selection when deleting the only conversation', () => {
    assert.equal(
      resolveWorkspaceConversationAfterDelete([conversations[0]], 1, 1),
      undefined
    )
  })
})
