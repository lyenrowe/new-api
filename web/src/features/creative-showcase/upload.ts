/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import OSS from 'ali-oss'

import { getUploadCredentials, uploadLocalShowcaseAsset } from './api'

function safeFileName(name: string) {
  const extension = name.includes('.') ? `.${name.split('.').pop()}` : ''
  return `${crypto.randomUUID()}${extension.toLowerCase()}`
}

export async function uploadShowcaseAsset(
  file: File,
  onProgress?: (percent: number) => void
) {
  const credentials = await getUploadCredentials()
  if (credentials.mode === 'local') {
    onProgress?.(0)
    const key = await uploadLocalShowcaseAsset(file)
    onProgress?.(1)
    return key
  }
  const client = new OSS({
    region: credentials.region,
    bucket: credentials.bucket,
    accessKeyId: credentials.access_key_id,
    accessKeySecret: credentials.access_key_secret,
    stsToken: credentials.security_token,
    secure: true,
  })
  const key = `${credentials.prefix}${new Date().toISOString().slice(0, 10)}/${safeFileName(file.name)}`
  await client.multipartUpload(key, file, { progress: onProgress })
  return key
}
