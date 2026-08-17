/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'react-i18next'
import { useStickToBottom } from 'use-stick-to-bottom'

import { Button } from '@/components/ui/button'

type WorkspaceScrollLayoutProps = {
  children: ReactNode
  composer: ReactNode
  onAtLatestChange: (atLatest: boolean) => void
  onScrollAwayFromComposer: () => void
}

export function WorkspaceScrollLayout(props: WorkspaceScrollLayoutProps) {
  const { t } = useTranslation()
  const composerDock = useRef<HTMLDivElement>(null)
  const lastScrollTop = useRef(0)
  const [composerHeight, setComposerHeight] = useState(0)
  const [dismissedByUpwardScroll, setDismissedByUpwardScroll] = useState(false)
  const stickToBottom = useStickToBottom({
    initial: 'instant',
    resize: 'instant',
  })
  const onAtLatestChange = props.onAtLatestChange
  const atLatest = stickToBottom.isAtBottom && !dismissedByUpwardScroll

  useEffect(() => {
    onAtLatestChange(atLatest)
  }, [atLatest, onAtLatestChange])

  useLayoutEffect(() => {
    const element = composerDock.current
    if (!element) return
    const updateHeight = () => {
      const height = element.getBoundingClientRect().height
      setComposerHeight(height)
    }
    updateHeight()
    const observer = new ResizeObserver(updateHeight)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div
      className='relative min-h-0 flex-1 overflow-hidden'
      data-workspace-scroll-layout='true'
    >
      <div
        ref={stickToBottom.scrollRef}
        className='h-full [scrollbar-gutter:stable_both-edges] overflow-y-auto px-4'
        data-workspace-scroll-viewport='true'
        onScroll={(event) => {
          const element = event.currentTarget
          const scrollingDown = element.scrollTop > lastScrollTop.current
          lastScrollTop.current = element.scrollTop
          const distanceFromBottom =
            element.scrollHeight - element.scrollTop - element.clientHeight
          if (scrollingDown && distanceFromBottom < 70) {
            setDismissedByUpwardScroll(false)
          }
        }}
        onWheel={(event) => {
          if (event.deltaY < 0) {
            stickToBottom.stopScroll()
            setDismissedByUpwardScroll(true)
            const activeElement = document.activeElement
            if (
              activeElement instanceof HTMLElement &&
              composerDock.current?.contains(activeElement)
            ) {
              activeElement.blur()
            }
            props.onScrollAwayFromComposer()
            return
          }
          const element = event.currentTarget
          const distanceFromBottom =
            element.scrollHeight - element.scrollTop - element.clientHeight
          if (distanceFromBottom < 1) {
            setDismissedByUpwardScroll(false)
          }
        }}
      >
        <div ref={stickToBottom.contentRef} className='min-h-full'>
          {props.children}
          <div
            aria-hidden='true'
            data-workspace-composer-clearance='true'
            style={{ height: composerHeight }}
          />
        </div>
      </div>

      {!atLatest && (
        <Button
          className='absolute left-1/2 z-20 -translate-x-1/2 rounded-full shadow-md'
          size='sm'
          style={{ bottom: composerHeight + 12 }}
          variant='secondary'
          onClick={() => {
            setDismissedByUpwardScroll(false)
            void stickToBottom.scrollToBottom({ animation: 'smooth' })
          }}
        >
          {t('Return to latest')}
        </Button>
      )}

      <div
        ref={composerDock}
        className='pointer-events-none absolute inset-x-0 bottom-0 z-10 max-h-[50svh] px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]'
        data-workspace-composer-dock='true'
      >
        <div
          className='pointer-events-auto mx-auto max-h-[calc(50svh-1.25rem)] w-full max-w-5xl overflow-x-hidden overflow-y-auto'
          data-workspace-composer-interaction='true'
        >
          {props.composer}
        </div>
      </div>
    </div>
  )
}
