/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import {
  AiBrain01Icon,
  AiImageIcon,
  AiVideoIcon,
  ArrowLeft01Icon,
  Image01Icon,
  InformationCircleIcon,
  MagicWand01Icon,
  SparklesIcon,
  TextCreationIcon,
  Video01Icon,
} from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PublicLayout } from '@/components/layout'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { useIsAdmin } from '@/hooks/use-admin'
import { cn } from '@/lib/utils'

import { getShowcaseCases, getShowcaseCategories } from './api'
import { showcaseContentTypes, showcaseCreationTools } from './showcase-layout'
import type { ShowcaseCase, ShowcaseCaseType } from './types'

const contentTypeIcons = {
  image: Image01Icon,
  video: Video01Icon,
}

const creationToolIcons = {
  text: TextCreationIcon,
  image: AiImageIcon,
  video: AiVideoIcon,
}

export function CreativeShowcasePage() {
  const { t } = useTranslation()
  const isAdmin = useIsAdmin()
  const [type, setType] = useState<ShowcaseCaseType>('image')
  const [categoryId, setCategoryId] = useState<number>()
  const [featured, setFeatured] = useState(false)
  const [preview, setPreview] =
    useState<ReturnType<typeof useShowcaseCases>['items'][number]>()
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const categories = useQuery({
    queryKey: ['creative-showcase', 'categories'],
    queryFn: () => getShowcaseCategories(),
  })
  const cases = useShowcaseCases(type, categoryId, featured)
  const { fetchNextPage, hasMore, isFetchingNextPage } = cases

  useEffect(() => {
    const target = loadMoreRef.current
    if (!target || !hasMore || isFetchingNextPage) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void fetchNextPage()
      },
      { rootMargin: '400px' }
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [fetchNextPage, hasMore, isFetchingNextPage])

  return (
    <PublicLayout showMainContainer={false}>
      <main className='bg-background min-h-screen'>
        <section className='relative overflow-hidden border-b'>
          <div
            aria-hidden
            className='absolute inset-0 bg-[radial-gradient(ellipse_55%_100%_at_78%_25%,oklch(0.61_0.2_260_/_0.24),transparent_66%),radial-gradient(ellipse_38%_90%_at_95%_5%,oklch(0.7_0.18_305_/_0.16),transparent_70%),linear-gradient(112deg,oklch(0.17_0.018_255),oklch(0.1_0.014_265))]'
          />
          <div className='relative mx-auto grid max-w-7xl items-center gap-8 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_30rem] lg:px-8 lg:py-14'>
            <div className='relative z-10'>
              <h1 className='text-3xl font-semibold tracking-tight text-white sm:text-4xl'>
                {t('Create with AI examples')}
              </h1>
              <p className='mt-3 max-w-2xl text-sm leading-6 text-white/65 sm:text-base'>
                {t(
                  'Browse image and video templates with ready-to-use prompts and generation settings.'
                )}
              </p>
            </div>
            <ShowcaseBanner />
          </div>
        </section>

        <section className='border-b'>
          <div className='mx-auto grid max-w-7xl gap-5 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:px-8'>
            <div>
              <p className='text-muted-foreground mb-2 text-xs font-medium tracking-[0.16em] uppercase'>
                {t('Content type')}
              </p>
              <div className='bg-muted/70 inline-flex rounded-xl p-1'>
                {showcaseContentTypes.map((contentType) => (
                  <Button
                    className='min-w-28'
                    key={contentType.type}
                    variant={type === contentType.type ? 'default' : 'ghost'}
                    onClick={() => {
                      setType(contentType.type)
                      setCategoryId(undefined)
                      setFeatured(false)
                    }}
                  >
                    <HugeiconsIcon
                      icon={contentTypeIcons[contentType.type]}
                      strokeWidth={2}
                    />
                    {t(contentType.labelKey)}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <p className='text-muted-foreground mb-2 text-xs font-medium tracking-[0.16em] uppercase lg:text-right'>
                {t('Creation tools')}
              </p>
              <div className='flex flex-wrap gap-2'>
                {showcaseCreationTools.map((tool) => (
                  <Button
                    key={tool.id}
                    variant='outline'
                    render={<Link to={tool.href} />}
                  >
                    <HugeiconsIcon
                      icon={creationToolIcons[tool.id]}
                      strokeWidth={2}
                    />
                    {t(tool.labelKey)}
                  </Button>
                ))}
                {isAdmin && (
                  <Button
                    variant='outline'
                    render={<Link to='/creative-showcase/manage' />}
                  >
                    {t('Manage cases')}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </section>

        <section className='mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8'>
          <div className='mb-3 flex gap-2 overflow-x-auto border-b pb-2'>
            <Button
              size='sm'
              variant={
                !featured && categoryId === undefined ? 'secondary' : 'ghost'
              }
              onClick={() => {
                setCategoryId(undefined)
                setFeatured(false)
              }}
            >
              {t('All')}
            </Button>
            <Button
              size='sm'
              variant={featured ? 'secondary' : 'ghost'}
              onClick={() => {
                setCategoryId(undefined)
                setFeatured(true)
              }}
            >
              {t('Featured cases')}
            </Button>
            {categories.data?.map((category) => (
              <Button
                key={category.id}
                size='sm'
                variant={categoryId === category.id ? 'secondary' : 'ghost'}
                onClick={() => {
                  setCategoryId(category.id)
                  setFeatured(false)
                }}
              >
                {category.name}
              </Button>
            ))}
          </div>
          <p className='text-muted-foreground mb-5 flex items-center gap-1.5 text-xs'>
            <HugeiconsIcon
              aria-hidden='true'
              className='size-3.5'
              icon={InformationCircleIcon}
              strokeWidth={2}
            />
            {t(
              'Click a case to preview it and customize the prompt, model, and settings in the workspace.'
            )}
          </p>
          {cases.isLoading ? (
            <ShowcaseLoading />
          ) : (
            <div className='columns-1 gap-4 sm:columns-2 lg:columns-3 xl:columns-4'>
              {cases.items.map((item) => (
                <article
                  className='group bg-card mb-4 break-inside-avoid overflow-hidden rounded-xl border [content-visibility:auto]'
                  key={item.id}
                >
                  <div className='relative'>
                    <img
                      alt={item.title}
                      className='w-full object-cover'
                      loading='lazy'
                      src={item.cover_url}
                    />
                    <div className='absolute inset-0 flex items-center justify-center bg-black/45 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100'>
                      <Button onClick={() => setPreview(item)}>
                        {t('Full preview')}
                      </Button>
                    </div>
                    {item.type === 'video' && (
                      <span className='absolute top-2 left-2 rounded bg-black/65 px-2 py-1 text-xs text-white'>
                        {item.duration ? `${item.duration}s` : t('Video')}
                      </span>
                    )}
                  </div>
                  <div className='space-y-1 p-3'>
                    <p className='line-clamp-1 font-medium'>{item.title}</p>
                    <p className='text-muted-foreground line-clamp-2 text-sm'>
                      {item.prompt}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          )}
          {cases.hasMore && (
            <div className='mt-8 text-center' ref={loadMoreRef}>
              <Button
                variant='outline'
                disabled={cases.isFetchingNextPage}
                onClick={() => cases.fetchNextPage()}
              >
                {cases.isFetchingNextPage ? t('Loading...') : t('Load more')}
              </Button>
            </div>
          )}
        </section>
        <PreviewDialog
          item={preview}
          items={cases.items}
          onOpenChange={(open) => !open && setPreview(undefined)}
          onSelect={setPreview}
        />
      </main>
    </PublicLayout>
  )
}

function ShowcaseBanner() {
  return (
    <div
      aria-hidden='true'
      className='relative hidden h-36 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035] shadow-[0_20px_80px_-20px_oklch(0.62_0.2_265_/_0.45)] lg:block'
    >
      <div className='absolute inset-0 bg-[radial-gradient(circle_at_68%_52%,oklch(0.72_0.19_278_/_0.34),transparent_36%),linear-gradient(120deg,transparent_15%,oklch(0.63_0.2_245_/_0.16),transparent_76%)]' />
      <div className='absolute top-1/2 left-1/2 h-24 w-80 -translate-x-1/2 -translate-y-1/2 [transform:translate(-50%,-50%)_rotate(-9deg)] rounded-[50%] border border-blue-300/20' />
      <div className='absolute top-1/2 left-1/2 h-14 w-96 -translate-x-1/2 -translate-y-1/2 [transform:translate(-50%,-50%)_rotate(8deg)] rounded-[50%] border border-violet-300/20' />
      <div className='absolute top-5 left-12 h-24 w-36 -rotate-6 rounded-xl border border-cyan-300/25 bg-gradient-to-br from-blue-400/20 to-indigo-900/15 shadow-2xl backdrop-blur-sm'>
        <div className='absolute inset-2 rounded-lg border border-white/10 bg-[linear-gradient(145deg,oklch(0.7_0.17_220_/_0.16),transparent_58%)]' />
        <HugeiconsIcon
          className='absolute right-4 bottom-4 size-8 text-cyan-100/55'
          icon={AiImageIcon}
          strokeWidth={1.5}
        />
      </div>
      <div className='absolute top-7 left-44 h-24 w-36 rotate-3 rounded-xl border border-violet-300/30 bg-gradient-to-br from-violet-400/25 to-fuchsia-900/15 shadow-2xl backdrop-blur-sm'>
        <HugeiconsIcon
          className='absolute top-1/2 left-1/2 size-9 -translate-x-1/2 -translate-y-1/2 text-white/65'
          icon={SparklesIcon}
          strokeWidth={1.5}
        />
      </div>
      <div className='absolute top-4 right-11 h-24 w-36 -rotate-3 rounded-xl border border-blue-300/25 bg-gradient-to-br from-fuchsia-400/15 to-blue-500/25 shadow-2xl backdrop-blur-sm'>
        <HugeiconsIcon
          className='absolute top-4 left-4 size-8 text-violet-100/55'
          icon={AiVideoIcon}
          strokeWidth={1.5}
        />
        <div className='absolute right-3 bottom-3 left-3 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent' />
      </div>
      <span className='absolute top-4 left-6 size-1 rounded-full bg-cyan-300 shadow-[0_0_12px_3px_oklch(0.8_0.15_210_/_0.6)]' />
      <span className='absolute right-7 bottom-5 size-1.5 rounded-full bg-violet-300 shadow-[0_0_14px_4px_oklch(0.75_0.17_290_/_0.55)]' />
      <span className='absolute top-6 right-1/3 size-1 rounded-full bg-white/80' />
    </div>
  )
}

function useShowcaseCases(
  type: ShowcaseCaseType,
  categoryId?: number,
  featured?: boolean
) {
  const query = useInfiniteQuery({
    queryKey: ['creative-showcase', 'cases', type, categoryId, featured],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      getShowcaseCases({ page: pageParam, type, categoryId, featured }),
    getNextPageParam: (page) => (page.has_more ? page.page + 1 : undefined),
  })
  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data]
  )
  return { ...query, items, hasMore: Boolean(query.hasNextPage) }
}

function ShowcaseLoading() {
  return (
    <div className='grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4'>
      {Array.from({ length: 8 }, (_, index) => (
        <Skeleton className='h-64 rounded-xl' key={index} />
      ))}
    </div>
  )
}

export function PreviewDialog(props: {
  item?: ShowcaseCase
  items: ShowcaseCase[]
  onOpenChange: (open: boolean) => void
  onSelect: (item: ShowcaseCase) => void
}) {
  const { t } = useTranslation()
  if (!props.item) return null

  const promptLabel =
    props.item.type === 'video' ? t('Video prompt') : t('Image prompt')

  return (
    <Dialog open onOpenChange={props.onOpenChange}>
      <DialogContent
        className='inset-0 top-0 left-0 flex h-dvh w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none p-0 sm:max-w-none'
        showCloseButton={false}
      >
        <header className='flex h-14 shrink-0 items-center border-b px-3 sm:px-4'>
          <DialogClose render={<Button variant='ghost' />}>
            <HugeiconsIcon
              data-icon='inline-start'
              icon={ArrowLeft01Icon}
              strokeWidth={2}
            />
            {t('Back')}
          </DialogClose>
          <DialogHeader className='min-w-0 flex-1 items-center px-3 text-center'>
            <DialogTitle className='max-w-full truncate'>
              {props.item.title}
            </DialogTitle>
            <DialogDescription className='sr-only'>
              {t('Full preview')}
            </DialogDescription>
          </DialogHeader>
          <div aria-hidden className='w-16' />
        </header>

        <div className='grid min-h-0 flex-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_22rem_7.5rem] lg:overflow-hidden'>
          <section
            className='bg-muted/40 flex min-h-[52vh] items-center justify-center p-3 sm:p-5 lg:min-h-0'
            data-showcase-preview-pane='media'
          >
            {props.item.type === 'video' && props.item.media_url ? (
              <video
                className='max-h-full max-w-full rounded-lg bg-black object-contain shadow-2xl'
                controls
                playsInline
                poster={props.item.cover_url}
                src={props.item.media_url}
              />
            ) : (
              <img
                alt={props.item.title}
                className='max-h-full max-w-full rounded-lg object-contain shadow-2xl'
                src={props.item.cover_url}
              />
            )}
          </section>

          <section
            className='bg-card flex min-h-[32rem] min-w-0 flex-col border-t lg:min-h-0 lg:border-t-0 lg:border-l'
            data-showcase-preview-pane='details'
          >
            <div className='flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5'>
              <div className='flex items-center gap-3'>
                <span className='bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-xl'>
                  <HugeiconsIcon
                    className='size-5'
                    icon={AiBrain01Icon}
                    strokeWidth={1.8}
                  />
                </span>
                <div className='min-w-0'>
                  <p className='truncate font-medium'>
                    {props.item.model || t('Generation preset')}
                  </p>
                  <p className='text-muted-foreground mt-0.5 truncate text-xs'>
                    {props.item.title}
                  </p>
                </div>
              </div>

              <Separator />

              <div className='bg-muted/45 rounded-xl border p-4'>
                <p className='mb-3 flex items-center gap-2 text-sm font-medium'>
                  <span className='bg-primary size-1.5 rounded-full' />
                  {promptLabel}
                </p>
                <p className='text-muted-foreground text-sm leading-6 whitespace-pre-wrap'>
                  {props.item.prompt}
                </p>
              </div>

              <div className='flex flex-wrap gap-2'>
                {props.item.size && (
                  <Badge variant='outline'>
                    {t('Size')}: {props.item.size}
                  </Badge>
                )}
                {props.item.aspect_ratio && (
                  <Badge variant='outline'>
                    {t('Aspect ratio')}: {props.item.aspect_ratio}
                  </Badge>
                )}
                {props.item.duration ? (
                  <Badge variant='outline'>
                    {t('Duration')}: {props.item.duration}s
                  </Badge>
                ) : null}
              </div>
            </div>

            <div className='bg-card border-t p-4'>
              <Button
                className='w-full'
                size='lg'
                render={<Link to='/playground' />}
              >
                <HugeiconsIcon
                  data-icon='inline-start'
                  icon={MagicWand01Icon}
                  strokeWidth={2}
                />
                {t('Open in workspace')}
              </Button>
            </div>
          </section>

          <aside
            className='bg-background flex min-w-0 flex-col border-t lg:min-h-0 lg:border-t-0 lg:border-l'
            data-showcase-preview-pane='related'
          >
            <h2 className='shrink-0 px-3 py-3 text-sm font-medium lg:border-b'>
              {t('Other cases')}
            </h2>
            <div className='flex gap-2 overflow-x-auto px-3 pb-4 lg:flex-1 lg:flex-col lg:overflow-x-hidden lg:overflow-y-auto lg:px-2 lg:py-3'>
              {props.items.map((item) => (
                <button
                  aria-label={item.title}
                  aria-pressed={item.id === props.item?.id}
                  className={cn(
                    'focus-visible:ring-ring relative h-20 w-28 shrink-0 overflow-hidden rounded-lg border-2 border-transparent outline-none focus-visible:ring-2 lg:h-auto lg:w-full lg:aspect-[4/3]',
                    item.id === props.item?.id && 'border-primary'
                  )}
                  key={item.id}
                  onClick={() => props.onSelect(item)}
                  type='button'
                >
                  <img
                    alt=''
                    className='size-full object-cover'
                    loading='lazy'
                    src={item.cover_url}
                  />
                  {item.type === 'video' && (
                    <span className='absolute inset-0 flex items-center justify-center bg-black/15'>
                      <HugeiconsIcon
                        className='size-5 text-white drop-shadow'
                        icon={Video01Icon}
                        strokeWidth={2}
                      />
                    </span>
                  )}
                </button>
              ))}
            </div>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
  )
}
