# Creative Showcase extension

This optional module owns the creative-case schema, HTTP handlers, OSS STS
issuance, and its frontend feature. The core application integrates it only
through `model/main.go` migration registration and `router/api-router.go`.

## Required deployment configuration

```env
ALIYUN_ACCESS_KEY_ID=your-ram-access-key-id
ALIYUN_ACCESS_KEY_SECRET=your-ram-access-key-secret
CREATIVE_SHOWCASE_OSS_BUCKET=your-oss-bucket
CREATIVE_SHOWCASE_OSS_REGION=oss-cn-hangzhou
CREATIVE_SHOWCASE_OSS_ROLE_ARN=acs:ram::123456789012:role/creative-showcase-upload
CREATIVE_SHOWCASE_OSS_PREFIX=creative-showcase/  # Optional, defaults to "creative-showcase/"
CREATIVE_SHOWCASE_CDN_URL=https://s.zhouyitoken.com
```

The RAM role must only permit `PutObject` and multipart-upload operations in the `$CREATIVE_SHOWCASE_OSS_PREFIX` prefix. Configure OSS CORS to permit the dashboard origin and the methods/headers used by the OSS browser SDK. The browser receives only a 15-minute temporary STS credential; the long-lived access key stays on the server.
the `creative-showcase/*` prefix. Configure OSS CORS to permit the dashboard
origin and the methods/headers used by the OSS browser SDK. The browser receives
only a 15-minute temporary STS credential; the long-lived access key stays on
the server.

## Local fallback

If the OSS settings are absent, uploads fall back to local files under
`data/creative-showcase/` and are served from `/api/creative-showcase/assets/`.
Set `CREATIVE_SHOWCASE_LOCAL_DIR` to move the `data` root (for example, to a
mounted persistent volume). Local uploads are limited to image/video files and
500 MB per file.
