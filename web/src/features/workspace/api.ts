/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { isAxiosError } from 'axios'

import { getFreshAuthHeaders } from '@/lib/api'
import { api } from '@/lib/http-client'

import type {
  PageData,
  WorkspaceAsset,
  WorkspaceAPIKeyRequirement,
  WorkspaceCapabilities,
  WorkspaceConversation,
  WorkspaceConversationDetail,
  WorkspaceDraft,
  WorkspaceDraftState,
  WorkspaceRound,
  WorkspaceType,
} from './types'

type ApiResponse<T> = { success: boolean; message?: string; data: T }

export async function getWorkspaceCapabilities() {
  const response = await api.get<ApiResponse<WorkspaceCapabilities>>(
    '/api/workspace/capabilities'
  )
  return response.data.data
}

export async function getWorkspaceConversations(query = '') {
  const response = await api.get<ApiResponse<PageData<WorkspaceConversation>>>(
    '/api/workspace/conversations',
    { params: { q: query, page_size: 100 } }
  )
  return response.data.data
}

export async function createWorkspaceConversation(type: WorkspaceType) {
  const response = await api.post<ApiResponse<WorkspaceConversation>>(
    '/api/workspace/conversations',
    { active_type: type }
  )
  return response.data.data
}

export async function getWorkspaceConversation(id: number) {
  const response = await api.get<ApiResponse<WorkspaceConversationDetail>>(
    `/api/workspace/conversations/${id}`
  )
  return response.data.data
}

export async function updateWorkspaceConversation(
  id: number,
  input: { title?: string; active_type?: WorkspaceType }
) {
  await api.patch(`/api/workspace/conversations/${id}`, input)
}

export async function deleteWorkspaceConversation(id: number) {
  await api.delete(`/api/workspace/conversations/${id}`)
}

export async function createWorkspacePreset(caseId: number) {
  const response = await api.post<
    ApiResponse<{
      conversation: WorkspaceConversation
      draft: WorkspaceDraft
    }>
  >(`/api/workspace/presets/cases/${caseId}`)
  return response.data.data
}

export async function getWorkspaceGroups() {
  const response = await api.get<
    ApiResponse<Record<string, { desc: string; ratio: number | string }>>
  >('/api/user/self/groups')
  return response.data.data
}

export async function saveWorkspaceDraft(
  conversationId: number,
  type: WorkspaceType,
  draft: WorkspaceDraftState
) {
  const response = await api.put<ApiResponse<WorkspaceDraft>>(
    `/api/workspace/conversations/${conversationId}/drafts/${type}`,
    {
      model: draft.model,
      group: draft.group,
      prompt: draft.prompt,
      settings: JSON.stringify(draft.settings),
      asset_ids: JSON.stringify(draft.assets.map((asset) => asset.id)),
    }
  )
  return response.data.data
}

export async function createWorkspaceRound(
  conversationId: number,
  type: WorkspaceType,
  draft: WorkspaceDraftState
) {
  try {
    const response = await api.post<ApiResponse<WorkspaceRound>>(
      `/api/workspace/conversations/${conversationId}/rounds`,
      {
        type,
        model: draft.model,
        group: draft.group,
        prompt: draft.prompt,
        settings: JSON.stringify(draft.settings),
        asset_ids: JSON.stringify(draft.assets.map((asset) => asset.id)),
      },
      { skipErrorHandler: true }
    )
    return response.data.data
  } catch (error) {
    throw workspaceRequestError(error)
  }
}

export async function getWorkspaceRound(id: number) {
  const response = await api.get<ApiResponse<WorkspaceRound>>(
    `/api/workspace/rounds/${id}`
  )
  return response.data.data
}

export async function saveWorkspaceTextResult(
  id: number,
  input: { text?: string; error?: string; failed?: boolean }
) {
  await api.patch(`/api/workspace/rounds/${id}/text-result`, input)
}

export async function getWorkspaceAssets(kind: 'image' | 'video', query = '') {
  const response = await api.get<ApiResponse<PageData<WorkspaceAsset>>>(
    '/api/workspace/assets',
    { params: { kind, q: query, page_size: 100 } }
  )
  return response.data.data
}

export async function uploadWorkspaceAsset(
  kind: 'image' | 'video',
  file: File,
  onProgress?: (progress: number) => void
) {
  const credentialsResponse = await api.post<
    ApiResponse<{
      mode: 'local' | 'oss'
      access_key_id?: string
      access_key_secret?: string
      security_token?: string
      bucket?: string
      region?: string
      prefix: string
    }>
  >('/api/workspace/assets/upload-credentials')
  const credentials = credentialsResponse.data.data
  if (credentials.mode === 'oss') {
    if (
      !credentials.region ||
      !credentials.bucket ||
      !credentials.access_key_id ||
      !credentials.access_key_secret ||
      !credentials.security_token
    ) {
      throw new Error('Incomplete workspace upload credentials')
    }
    const { default: OSS } = await import('ali-oss')
    const client = new OSS({
      region: credentials.region,
      bucket: credentials.bucket,
      accessKeyId: credentials.access_key_id,
      accessKeySecret: credentials.access_key_secret,
      stsToken: credentials.security_token,
      secure: true,
    })
    const extension = file.name.includes('.')
      ? `.${file.name.split('.').pop()?.toLowerCase()}`
      : ''
    const key = `${credentials.prefix}${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}${extension}`
    await client.multipartUpload(key, file, {
      progress: (percent) => onProgress?.(Math.round(percent * 100)),
    })
    const response = await api.post<ApiResponse<WorkspaceAsset>>(
      '/api/workspace/assets/register',
      {
        kind,
        name: file.name,
        storage_key: key,
        mime_type: file.type,
        size: file.size,
      }
    )
    return response.data.data
  }
  const form = new FormData()
  form.append('kind', kind)
  form.append('file', file)
  const response = await api.post<ApiResponse<WorkspaceAsset>>(
    '/api/workspace/assets',
    form,
    {
      onUploadProgress: (event) => {
        if (event.total) {
          onProgress?.(Math.round((event.loaded / event.total) * 100))
        }
      },
    }
  )
  return response.data.data
}

export async function generateWorkspaceMedia(
  round: WorkspaceRound,
  draft: WorkspaceDraftState
) {
  const images = draft.assets
    .filter((asset) => asset.kind === 'image')
    .map((asset) => asset.public_url)
  const settings = draft.settings
  const operation = images.length > 0 ? 'edit' : 'generate'
  const payload: Record<string, unknown> = {
    round_id: round.id,
    kind: round.type,
    operation,
    model: round.model,
    group: round.group,
    prompt: round.prompt,
    n: 1,
  }
  if (round.type === 'image') {
    if (round.model.startsWith('gpt-image-2')) {
      payload.size = gptImageSize(
        settings.resolution || '1K',
        settings.aspectRatio || '1:1'
      )
      payload.quality = settings.quality || 'medium'
    } else if (round.model.startsWith('gemini-')) {
      payload.size = settings.aspectRatio || '1:1'
      payload.quality = settings.resolution || '1K'
    } else {
      payload.size = settings.resolution || '2K'
      payload.quality = settings.quality
      payload.extra_fields = {
        aspect_ratio: settings.aspectRatio || '1:1',
      }
    }
    if (images.length === 1) payload.image = images[0]
    if (images.length > 1) payload.images = images
  } else {
    payload.mode = settings.mode
    payload.duration = Number(settings.duration || 5)
    payload.size = settings.aspectRatio
    payload.image = images[0]
    payload.images = images
    if (round.model === 'doubao-seedance-2-0-260128') {
      const content: Array<Record<string, unknown>> = []
      for (const image of images) {
        content.push({ type: 'image_url', image_url: { url: image } })
      }
      payload.metadata = {
        content,
        resolution: settings.resolution,
        ratio: settings.aspectRatio,
        duration: Number(settings.duration || 5),
        generate_audio: settings.audio ?? true,
      }
    } else {
      payload.metadata = {
        mode: settings.mode,
        aspect_ratio: settings.aspectRatio,
        image_tail: images[1],
        generate_audio: settings.audio ?? true,
      }
    }
  }
  try {
    const response = await api.post('/api/workspace/generate', payload, {
      skipErrorHandler: true,
    })
    return response.data
  } catch (error) {
    throw workspaceRequestError(error)
  }
}

const gptImageSizes: Record<string, Record<string, string>> = {
  '1K': {
    '1:1': '1024x1024',
    '3:2': '1536x1024',
    '2:3': '1024x1536',
    '4:3': '1152x864',
    '3:4': '864x1152',
    '16:9': '1280x720',
    '9:16': '720x1280',
  },
  '2K': {
    '1:1': '2048x2048',
    '3:2': '2304x1536',
    '2:3': '1536x2304',
    '4:3': '2048x1536',
    '3:4': '1536x2048',
    '16:9': '2048x1152',
    '9:16': '1152x2048',
  },
  '4K': {
    '1:1': '2880x2880',
    '3:2': '3456x2304',
    '2:3': '2304x3456',
    '4:3': '3264x2448',
    '3:4': '2448x3264',
    '16:9': '3840x2160',
    '9:16': '2160x3840',
  },
}

export function gptImageSize(resolution: string, aspectRatio: string) {
  return gptImageSizes[resolution]?.[aspectRatio] || gptImageSizes['1K']['1:1']
}

type StreamCallbacks = {
  onChunk: (chunk: string) => void
  onComplete: () => void
  onError: (message: string) => void
  onAPIKeyRequired: (requirement: WorkspaceAPIKeyRequirement) => void
}

export async function streamWorkspaceText(
  round: WorkspaceRound,
  previousRounds: WorkspaceRound[],
  callbacks: StreamCallbacks
) {
  const messages = previousRounds
    .filter((item) => item.type === 'text' && item.status === 'succeeded')
    .flatMap((item) => [
      { role: 'user', content: item.prompt },
      { role: 'assistant', content: item.text_result || '' },
    ])
  messages.push({ role: 'user', content: round.prompt })
  const headers = await getFreshAuthHeaders()
  const response = await fetch('/api/workspace/generate', {
    method: 'POST',
    credentials: 'include',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      round_id: round.id,
      kind: 'text',
      model: round.model,
      group: round.group,
      prompt: round.prompt,
      messages,
      stream: true,
    }),
  })
  if (!response.ok || !response.body) {
    const error = (await response.json().catch(() => undefined)) as
      | WorkspaceErrorResponse
      | undefined
    if (error?.code === 'workspace_api_key_required' && error.data) {
      callbacks.onAPIKeyRequired(error.data)
      return
    }
    callbacks.onError(error?.message || `HTTP ${response.status}`)
    return
  }
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      pending += decoder.decode(result.value, { stream: true })
      const lines = pending.split('\n')
      pending = lines.pop() || ''
      for (const line of lines) {
        if (!line.startsWith('data:')) continue
        const data = line.slice(5).trim()
        if (!data || data === '[DONE]') continue
        const parsed = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>
          error?: { message?: string }
        }
        if (parsed.error?.message) {
          callbacks.onError(parsed.error.message)
          return
        }
        const content = parsed.choices?.[0]?.delta?.content
        if (content) callbacks.onChunk(content)
      }
    }
    callbacks.onComplete()
  } catch (error) {
    callbacks.onError(error instanceof Error ? error.message : 'Stream failed')
  }
}

type WorkspaceErrorResponse = {
  code?: string
  message?: string
  data?: WorkspaceAPIKeyRequirement
}

export class WorkspaceAPIKeyRequiredError extends Error {
  requirement: WorkspaceAPIKeyRequirement

  constructor(requirement: WorkspaceAPIKeyRequirement, message?: string) {
    super(message || 'A usable API key is required')
    this.name = 'WorkspaceAPIKeyRequiredError'
    this.requirement = requirement
  }
}

function workspaceRequestError(error: unknown) {
  if (isAxiosError<WorkspaceErrorResponse>(error)) {
    const response = error.response?.data
    if (response?.code === 'workspace_api_key_required' && response.data) {
      return new WorkspaceAPIKeyRequiredError(response.data, response.message)
    }
  }
  return error
}
