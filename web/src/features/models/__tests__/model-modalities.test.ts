/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import assert from 'node:assert/strict'
import { describe, test } from 'node:test'

import {
  modelFormSchema,
  transformFormDataToModelPayload,
  transformModelToFormDefaults,
} from '../lib/model-form'
import type { Model } from '../types'

describe('model modality form data', () => {
  test('preserves input and output modalities through form transformations', () => {
    const model = {
      id: 1,
      model_name: 'media-model',
      status: 1,
      sync_official: 1,
      created_time: 1,
      updated_time: 1,
      name_rule: 0,
      input_modalities: ['text', 'image'],
      output_modalities: ['image'],
    } satisfies Model

    const formValues = transformModelToFormDefaults(model)
    assert.deepEqual(formValues.input_modalities, ['text', 'image'])
    assert.deepEqual(formValues.output_modalities, ['image'])
    assert.deepEqual(
      transformFormDataToModelPayload(formValues).output_modalities,
      ['image']
    )
  })

  test('rejects modality values outside the supported enum', () => {
    const result = modelFormSchema.safeParse({
      model_name: 'invalid-model',
      input_modalities: ['binary'],
    })
    assert.equal(result.success, false)
  })
})
