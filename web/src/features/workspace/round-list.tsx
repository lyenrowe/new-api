/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import {
  Download04Icon,
  Edit02Icon,
  Loading03Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Markdown } from '@/components/ui/markdown'

import type { WorkspaceRound } from './types'

type RoundListProps = {
  rounds: WorkspaceRound[]
  streamingRoundId?: number
  streamingText: string
  onEdit: (round: WorkspaceRound) => void
  onRetry: (round: WorkspaceRound) => void
}

export function RoundList(props: RoundListProps) {
  const { t } = useTranslation()
  if (props.rounds.length === 0) {
    return (
      <div className='flex min-h-64 flex-col items-center justify-center text-center'>
        <h2 className='text-xl font-semibold'>{t('Start creating')}</h2>
        <p className='text-muted-foreground mt-2 max-w-md text-sm'>
          {t(
            'Choose a content type and model, describe your idea, then submit it to the workspace.'
          )}
        </p>
      </div>
    )
  }
  return (
    <div className='space-y-8 py-6'>
      {props.rounds.map((round) => {
        const output = parseRoundOutput(round.output)
        const text =
          props.streamingRoundId === round.id
            ? props.streamingText
            : round.text_result
        return (
          <article className='space-y-3' key={round.id}>
            <div className='bg-muted/55 ml-auto max-w-[82%] rounded-2xl rounded-br-sm px-4 py-3 text-sm whitespace-pre-wrap'>
              {round.prompt}
            </div>
            <div className='bg-card overflow-hidden rounded-2xl border shadow-sm'>
              <div className='flex items-center justify-between border-b px-4 py-2'>
                <span className='text-muted-foreground text-xs'>
                  {round.model}
                </span>
                <RoundStatus status={round.status} />
              </div>
              <div className='p-4'>
                {round.type === 'text' && text && <Markdown>{text}</Markdown>}
                {round.type === 'image' && output.image && (
                  <div className='space-y-3'>
                    <a
                      aria-label={t('Open')}
                      href={output.image}
                      rel='noreferrer'
                      target='_blank'
                    >
                      <img
                        alt={round.prompt}
                        className='max-h-[42rem] w-full rounded-xl object-contain'
                        src={output.image}
                      />
                    </a>
                    <div className='flex flex-wrap gap-2'>
                      <Button
                        variant='outline'
                        render={<a download href={output.image} />}
                      >
                        <HugeiconsIcon icon={Download04Icon} strokeWidth={2} />
                        {t('Download')}
                      </Button>
                      <RoundActions round={round} {...props} />
                    </div>
                  </div>
                )}
                {round.type === 'video' && output.video && (
                  <div className='space-y-3'>
                    <video
                      className='max-h-[42rem] w-full rounded-xl bg-black'
                      controls
                      src={output.video}
                    />
                    <div className='flex flex-wrap gap-2'>
                      <Button
                        variant='outline'
                        render={<a download href={output.video} />}
                      >
                        <HugeiconsIcon icon={Download04Icon} strokeWidth={2} />
                        {t('Download')}
                      </Button>
                      <RoundActions round={round} {...props} />
                    </div>
                  </div>
                )}
                {(round.status === 'queued' ||
                  round.status === 'generating') && (
                  <div className='text-muted-foreground flex items-center gap-2 py-8 text-sm'>
                    <HugeiconsIcon
                      className='size-4 animate-spin'
                      icon={Loading03Icon}
                      strokeWidth={2}
                    />
                    {round.status === 'queued'
                      ? t('Waiting in queue')
                      : t('Generating content')}
                  </div>
                )}
                {round.status === 'failed' && (
                  <div className='space-y-3'>
                    <p className='text-destructive text-sm'>
                      {round.error || t('Generation failed')}
                    </p>
                    <RoundActions round={round} {...props} />
                  </div>
                )}
                {round.type === 'text' && round.status === 'succeeded' && (
                  <div className='mt-4'>
                    <RoundActions round={round} {...props} />
                  </div>
                )}
              </div>
            </div>
          </article>
        )
      })}
    </div>
  )
}

function RoundActions(
  props: RoundListProps & {
    round: WorkspaceRound
  }
) {
  const { t } = useTranslation()
  return (
    <div className='flex gap-2'>
      <Button variant='outline' onClick={() => props.onEdit(props.round)}>
        <HugeiconsIcon icon={Edit02Icon} strokeWidth={2} />
        {t('Edit')}
      </Button>
      <Button variant='outline' onClick={() => props.onRetry(props.round)}>
        {t('Retry')}
      </Button>
    </div>
  )
}

function RoundStatus(props: { status: WorkspaceRound['status'] }) {
  const { t } = useTranslation()
  const labels: Record<WorkspaceRound['status'], string> = {
    queued: 'Queued',
    generating: 'Generating',
    succeeded: 'Completed',
    failed: 'Failed',
  }
  return <Badge variant='secondary'>{t(labels[props.status])}</Badge>
}

function parseRoundOutput(output?: string) {
  if (!output) return { image: '', video: '' }
  try {
    const value = JSON.parse(output) as {
      url?: string
      data?: Array<{ url?: string; b64_json?: string }>
    }
    const first = value.data?.[0]
    const image =
      first?.url ||
      (first?.b64_json ? `data:image/png;base64,${first.b64_json}` : '')
    return { image, video: value.url || '' }
  } catch {
    return { image: '', video: '' }
  }
}
