/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
export type WorkspaceType = 'text' | 'image' | 'video'
export type WorkspaceRoundStatus =
  | 'queued'
  | 'generating'
  | 'succeeded'
  | 'failed'

export type WorkspaceConversation = {
  id: number
  title: string
  active_type: WorkspaceType
  created_at: string
  updated_at: string
}

export type WorkspaceDraft = {
  id: number
  conversation_id: number
  type: WorkspaceType
  model: string
  group: string
  prompt: string
  settings: string
  asset_ids: string
  updated_at: string
}

export type WorkspaceRound = {
  id: number
  conversation_id: number
  type: WorkspaceType
  model: string
  group: string
  prompt: string
  settings: string
  asset_ids: string
  status: WorkspaceRoundStatus
  error?: string
  text_result?: string
  task_id?: string
  output?: string
  created_at: string
  updated_at: string
}

export type WorkspaceAsset = {
  id: number
  kind: 'image' | 'video'
  origin: 'upload' | 'generated' | 'case'
  name: string
  storage_key?: string
  public_url: string
  mime_type: string
  size: number
  created_at: string
}

export type CapabilityOption = { value: string; label: string }

export type WorkspaceModelCapability = {
  model: string
  vendor: string
  type: 'image' | 'video'
  groups: string[]
  reference_limit?: number
  resolutions?: CapabilityOption[]
  aspect_ratios?: CapabilityOption[]
  qualities?: CapabilityOption[]
  modes?: CapabilityOption[]
  durations?: CapabilityOption[]
  supports_audio?: boolean
  supports_frames?: boolean
  supports_video?: boolean
  supports_editing?: boolean
}

export type WorkspaceCapabilities = {
  text_models: WorkspaceTextModelCapability[]
  image_models: WorkspaceModelCapability[]
  video_models: WorkspaceModelCapability[]
}

export type WorkspaceTextModelCapability = {
  model: string
  vendor: string
  groups: string[]
}

export type WorkspaceConversationDetail = {
  conversation: WorkspaceConversation
  drafts: WorkspaceDraft[]
  rounds: WorkspaceRound[]
}

export type WorkspaceDraftSettings = {
  resolution?: string
  aspectRatio?: string
  quality?: string
  mode?: string
  duration?: string
  audio?: boolean
}

export type WorkspaceAPIKeyRequirement = {
  model: string
  group: string
  key_type: string
}

export type WorkspaceDraftState = {
  model: string
  group: string
  prompt: string
  settings: WorkspaceDraftSettings
  assets: WorkspaceAsset[]
}

export type PageData<T> = {
  items: T[]
  page: number
  page_size: number
  total: number
  has_more: boolean
}
