/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import type { WorkspaceDraftState, WorkspaceModelCapability } from './types'

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
    resolution: capability.resolutions?.[0]?.value,
    quality,
    duration: capability.durations?.[0]?.value,
    audio: capability.supports_audio ? false : undefined,
  }
}
