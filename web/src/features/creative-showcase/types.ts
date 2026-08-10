/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
export type ShowcaseCaseType = 'image' | 'video'

export type ShowcaseCategory = {
  id: number
  name: string
  sort_order: number
}

export type ShowcaseCase = {
  id: number
  title: string
  type: ShowcaseCaseType
  category_id: number
  cover_url: string
  cover_key?: string
  media_url?: string
  media_key?: string
  prompt: string
  size?: string
  aspect_ratio?: string
  duration?: number
  model?: string
  group?: string
  start_frame?: string
  end_frame?: string
  start_frame_key?: string
  end_frame_key?: string
  settings?: string
  reference_urls?: string
  featured: boolean
  published: boolean
  sort_order: number
}

export type ShowcaseCaseInput = Omit<
  ShowcaseCase,
  | 'id'
  | 'cover_url'
  | 'cover_key'
  | 'media_url'
  | 'media_key'
  | 'start_frame'
  | 'end_frame'
  | 'start_frame_key'
  | 'end_frame_key'
> & {
  cover_key: string
  media_key?: string
  start_frame?: string
  end_frame?: string
}

export type ShowcaseList = {
  items: ShowcaseCase[]
  page: number
  page_size: number
  total: number
  has_more: boolean
}

export type UploadCredentials = {
  mode: 'oss' | 'local'
  access_key_id: string
  access_key_secret: string
  security_token: string
  expiration: string
  bucket: string
  region: string
  prefix: string
}
