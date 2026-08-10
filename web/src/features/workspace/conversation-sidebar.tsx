/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import {
  Add01Icon,
  Delete02Icon,
  Edit02Icon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

import type { WorkspaceConversation } from './types'
import { groupWorkspaceConversations } from './workspace-groups'

type ConversationSidebarProps = {
  conversations: WorkspaceConversation[]
  selectedId?: number
  search: string
  onSearchChange: (value: string) => void
  onCreate: () => void
  onSelect: (id: number) => void
  onRename: (conversation: WorkspaceConversation) => void
  onDelete: (conversation: WorkspaceConversation) => void
}

export function ConversationSidebar(props: ConversationSidebarProps) {
  const { t } = useTranslation()
  const groups = groupWorkspaceConversations(props.conversations)

  return (
    <aside className='bg-muted/20 flex h-full min-h-0 w-full flex-col border-r'>
      <div className='space-y-3 border-b p-3'>
        <Button className='w-full' onClick={props.onCreate}>
          <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
          {t('New conversation')}
        </Button>
        <label className='relative block'>
          <span className='sr-only'>{t('Search conversations')}</span>
          <HugeiconsIcon
            aria-hidden='true'
            className='text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2'
            icon={Search01Icon}
            strokeWidth={2}
          />
          <Input
            className='pl-8'
            placeholder={t('Search conversations')}
            value={props.search}
            onChange={(event) => props.onSearchChange(event.target.value)}
          />
        </label>
      </div>
      <ScrollArea className='min-h-0 flex-1'>
        <nav aria-label={t('Conversations')} className='space-y-5 p-3'>
          {groups.map((group) => (
            <section key={group.label}>
              <h2 className='text-muted-foreground mb-1.5 px-2 text-xs font-medium'>
                {t(group.label)}
              </h2>
              <div className='space-y-1'>
                {group.conversations.map((conversation) => (
                  <div
                    className={cn(
                      'group flex items-center rounded-lg',
                      props.selectedId === conversation.id
                        ? 'bg-accent'
                        : 'hover:bg-accent/60'
                    )}
                    key={conversation.id}
                  >
                    <button
                      className='min-w-0 flex-1 truncate px-2 py-2 text-left text-sm outline-none focus-visible:ring-2'
                      type='button'
                      onClick={() => props.onSelect(conversation.id)}
                    >
                      {conversation.title}
                    </button>
                    <Button
                      aria-label={t('Rename conversation')}
                      className='opacity-0 group-focus-within:opacity-100 group-hover:opacity-100'
                      size='icon-xs'
                      variant='ghost'
                      onClick={() => props.onRename(conversation)}
                    >
                      <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} />
                    </Button>
                    <Button
                      aria-label={t('Delete conversation')}
                      className='mr-1 opacity-0 group-focus-within:opacity-100 group-hover:opacity-100'
                      size='icon-xs'
                      variant='ghost'
                      onClick={() => props.onDelete(conversation)}
                    >
                      <HugeiconsIcon icon={Delete02Icon} strokeWidth={2} />
                    </Button>
                  </div>
                ))}
              </div>
            </section>
          ))}
          {groups.length === 0 && (
            <p className='text-muted-foreground px-2 py-8 text-center text-sm'>
              {t('No conversations found')}
            </p>
          )}
        </nav>
      </ScrollArea>
    </aside>
  )
}
