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
