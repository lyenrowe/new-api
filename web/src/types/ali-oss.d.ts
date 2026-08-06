declare module 'ali-oss' {
  type OSSOptions = {
    region: string
    accessKeyId: string
    accessKeySecret: string
    stsToken: string
    bucket: string
    secure?: boolean
  }

  export default class OSS {
    public constructor(options: OSSOptions)
    public multipartUpload(
      objectKey: string,
      file: File,
      options?: { progress?: (percent: number) => void }
    ): Promise<unknown>
  }
}
