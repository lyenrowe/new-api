/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { api } from '@/lib/api'

import type {
  ShowcaseCase,
  ShowcaseCaseInput,
  ShowcaseCaseType,
  ShowcaseCategory,
  ShowcaseList,
  UploadCredentials,
} from './types'

type ApiResponse<T> = { success: boolean; message?: string; data: T }

export async function getShowcaseCategories(admin = false) {
  const path = admin
    ? '/api/creative-showcase/admin/categories'
    : '/api/creative-showcase/categories'
  const response = await api.get<ApiResponse<ShowcaseCategory[]>>(path)
  return response.data.data
}

export async function getShowcaseCases(params: {
  page: number
  type: ShowcaseCaseType
  categoryId?: number
  featured?: boolean
  admin?: boolean
}) {
  const path = params.admin
    ? '/api/creative-showcase/admin/cases'
    : '/api/creative-showcase/cases'
  const response = await api.get<ApiResponse<ShowcaseList>>(path, {
    params: {
      page: params.page,
      page_size: 20,
      type: params.type,
      category_id: params.categoryId,
      featured: params.featured,
    },
  })
  return response.data.data
}

export async function saveShowcaseCategory(input: ShowcaseCategory) {
  if (input.id) {
    await api.put(`/api/creative-showcase/admin/categories/${input.id}`, input)
    return
  }
  await api.post('/api/creative-showcase/admin/categories', input)
}

export async function removeShowcaseCategory(id: number) {
  await api.delete(`/api/creative-showcase/admin/categories/${id}`)
}

export async function saveShowcaseCase(input: ShowcaseCaseInput, id?: number) {
  if (id) {
    const response = await api.put<ApiResponse<ShowcaseCase>>(
      `/api/creative-showcase/admin/cases/${id}`,
      input
    )
    return response.data.data
  }
  const response = await api.post<ApiResponse<ShowcaseCase>>(
    '/api/creative-showcase/admin/cases',
    input
  )
  return response.data.data
}

export async function removeShowcaseCase(id: number) {
  await api.delete(`/api/creative-showcase/admin/cases/${id}`)
}

export async function getUploadCredentials() {
  const response = await api.post<ApiResponse<UploadCredentials>>(
    '/api/creative-showcase/admin/upload-credentials'
  )
  return response.data.data
}

export async function uploadLocalShowcaseAsset(file: File) {
  const form = new FormData()
  form.append('file', file)
  const response = await api.post<ApiResponse<{ key: string }>>(
    '/api/creative-showcase/admin/upload',
    form
  )
  return response.data.data.key
}
