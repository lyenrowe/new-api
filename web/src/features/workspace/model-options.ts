/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import type { WorkspaceCapabilities, WorkspaceType } from './types'

export type WorkspaceModelOption = {
  model: string
  vendor: string
  groups: string[]
}

export function workspaceModelOptions(
  type: WorkspaceType,
  capabilities?: WorkspaceCapabilities
): WorkspaceModelOption[] {
  if (type === 'text') return capabilities?.text_models || []
  const items =
    type === 'image'
      ? capabilities?.image_models || []
      : capabilities?.video_models || []
  return items.map((item) => ({
    model: item.model,
    vendor: item.vendor,
    groups: item.groups,
  }))
}

export function workspaceGroupForModel(
  option: WorkspaceModelOption | undefined,
  currentGroup: string,
  availableGroups: Record<string, unknown>
) {
  if (option?.groups.includes(currentGroup) && availableGroups[currentGroup]) {
    return currentGroup
  }
  return option?.groups.find((group) => availableGroups[group]) || ''
}
