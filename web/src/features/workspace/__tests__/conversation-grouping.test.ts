import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import dayjs from 'dayjs'

import type { WorkspaceConversation } from '../types'
import { groupWorkspaceConversations } from '../workspace-groups'

function conversation(id: string, updatedAt: string): WorkspaceConversation {
  return {
    id,
    title: `Conversation ${id}`,
    active_type: 'text',
    created_at: updatedAt,
    updated_at: updatedAt,
  }
}

describe('workspace conversation grouping', () => {
  test('places conversations into stable relative date groups', () => {
    const now = dayjs('2026-08-06T12:00:00Z')
    const groups = groupWorkspaceConversations(
      [
        conversation('conversation-1', '2026-08-06T08:00:00Z'),
        conversation('conversation-2', '2026-08-05T08:00:00Z'),
        conversation('conversation-3', '2026-08-02T08:00:00Z'),
        conversation('conversation-4', '2026-07-20T08:00:00Z'),
      ],
      now
    )

    assert.deepEqual(
      groups.map((group) => group.label),
      ['Today', 'Yesterday', 'Previous 7 days', 'Earlier']
    )
    assert.deepEqual(
      groups.map((group) => group.conversations[0].id),
      ['conversation-1', 'conversation-2', 'conversation-3', 'conversation-4']
    )
  })
})
