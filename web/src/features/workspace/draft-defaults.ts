/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import type {
  WorkspaceAsset,
  WorkspaceDraftState,
  WorkspaceModelCapability,
} from './types'

const seedanceModel = 'doubao-seedance-2-0-260128'
const klingModel = 'kling-v3'

export function defaultWorkspaceSettings(
  capability: WorkspaceModelCapability | undefined
): WorkspaceDraftState['settings'] {
  if (!capability) {
    return {}
  }
  const quality = capability.qualities?.some(
    (option) => option.value === 'medium'
  )
    ? 'medium'
    : capability.qualities?.[0]?.value
  return {
    mode: capability.modes?.[0]?.value,
    aspectRatio: capability.aspect_ratios?.[0]?.value,
    resolution:
      capability.type === 'image' &&
      capability.resolutions?.some((option) => option.value === '2K')
        ? '2K'
        : capability.resolutions?.[0]?.value,
    quality,
    duration: capability.durations?.[0]?.value,
    audio: capability.supports_audio ? true : undefined,
  }
}

export function normalizeWorkspaceDraft(
  draft: WorkspaceDraftState
): WorkspaceDraftState {
  if (draft.model !== seedanceModel && draft.model !== klingModel) return draft

  const images = draft.assets.filter((asset) => asset.kind === 'image')
  const settings = { ...draft.settings, audio: draft.settings.audio ?? true }
  let assets: WorkspaceAsset[] = images.slice(0, 2)

  if (draft.model === seedanceModel) {
    const mode =
      settings.mode === 'omni_reference' ? 'omni_reference' : 'first_last'
    settings.mode = mode
    assets = images.slice(0, mode === 'omni_reference' ? 12 : 2)
  }

  return { ...draft, settings, assets }
}
