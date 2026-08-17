/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
export const showcaseContentTypes = [
  { type: 'image', labelKey: 'Image cases' },
  { type: 'video', labelKey: 'Video cases' },
] as const

export const showcaseCreationTools = [
  {
    id: 'text',
    labelKey: 'Text generation',
    href: '/workspace',
    search: { type: 'text' },
  },
  {
    id: 'image',
    labelKey: 'Image generation',
    href: '/workspace',
    search: { type: 'image' },
  },
  {
    id: 'video',
    labelKey: 'Video generation',
    href: '/workspace',
    search: { type: 'video' },
  },
] as const

export const showcaseLayoutClasses = {
  header:
    'bg-background/95 ring-border/60 rounded-b-2xl shadow-sm ring-1 backdrop-blur-xl sm:rounded-2xl',
  hero: 'relative mx-auto grid max-w-7xl items-center gap-8 px-4 pt-12 pb-7 sm:px-6 lg:grid-cols-[minmax(0,1fr)_30rem] lg:px-8 lg:pt-14 lg:pb-8',
  toolbar:
    'mx-auto grid max-w-7xl items-center gap-4 px-4 py-4 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:px-8',
} as const
