/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import dayjs, { type Dayjs } from 'dayjs'

import type { WorkspaceConversation } from './types'

export type ConversationGroup = {
  label: 'Today' | 'Yesterday' | 'Previous 7 days' | 'Earlier'
  conversations: WorkspaceConversation[]
}

export function groupWorkspaceConversations(
  conversations: WorkspaceConversation[],
  now: Dayjs = dayjs()
): ConversationGroup[] {
  const groups: ConversationGroup[] = [
    { label: 'Today', conversations: [] },
    { label: 'Yesterday', conversations: [] },
    { label: 'Previous 7 days', conversations: [] },
    { label: 'Earlier', conversations: [] },
  ]
  for (const conversation of conversations) {
    const updated = dayjs(conversation.updated_at)
    const days = now.startOf('day').diff(updated.startOf('day'), 'day')
    if (days <= 0) groups[0].conversations.push(conversation)
    else if (days === 1) groups[1].conversations.push(conversation)
    else if (days <= 7) groups[2].conversations.push(conversation)
    else groups[3].conversations.push(conversation)
  }
  return groups.filter((group) => group.conversations.length > 0)
}
