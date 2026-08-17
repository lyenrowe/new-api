/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import { filterByOutputModality } from '../lib/filters'
import type { PricingModel } from '../types'

function pricingModel(
  modelName: string,
  outputModalities?: PricingModel['output_modalities']
): PricingModel {
  return {
    id: modelName.length,
    model_name: modelName,
    quota_type: 0,
    model_ratio: 1,
    completion_ratio: 1,
    enable_groups: ['default'],
    output_modalities: outputModalities,
  }
}

describe('output modality pricing filter', () => {
  const models = [
    pricingModel('text-only', ['text']),
    pricingModel('multi-output', ['text', 'image']),
    pricingModel('unclassified'),
  ]

  test('returns models containing the selected output modality', () => {
    assert.deepEqual(
      filterByOutputModality(models, 'image').map((model) => model.model_name),
      ['multi-output']
    )
  })

  test('keeps classified and unclassified models when the filter is all', () => {
    assert.equal(filterByOutputModality(models, 'all').length, 3)
  })
})
