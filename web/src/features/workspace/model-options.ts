/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import type { PricingData } from '../pricing/types'
import type { WorkspaceCapabilities, WorkspaceType } from './types'

export type WorkspaceModelOption = {
  model: string
  vendor: string
  groups: string[]
}

export function workspaceModelOptions(
  type: WorkspaceType,
  capabilities?: WorkspaceCapabilities,
  pricing?: PricingData
): WorkspaceModelOption[] {
  let items: WorkspaceModelOption[] = capabilities?.text_models || []
  if (type === 'image') items = capabilities?.image_models || []
  if (type === 'video') items = capabilities?.video_models || []
  const vendorNames = new Map(
    pricing?.vendors.map((vendor) => [vendor.id, vendor.name]) || []
  )
  const pricingVendors = new Map(
    pricing?.data.map((model) => [
      model.model_name,
      vendorNames.get(model.vendor_id || 0),
    ]) || []
  )

  return items.map((item) => ({
    model: item.model,
    vendor: pricing ? pricingVendors.get(item.model) || 'Custom' : item.vendor,
    groups: item.groups,
  }))
}

export function workspaceFirstModelForVendor(
  options: WorkspaceModelOption[],
  vendor: string
): WorkspaceModelOption | undefined {
  return options.find((option) => option.vendor === vendor)
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
