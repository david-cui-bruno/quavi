import { Storage } from '@google-cloud/storage'

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024
export interface MediaSigner {
  upload(key: string, contentType: string, bytes: number): Promise<{ url: string; fields: Record<string, string> }>
  read(key: string): Promise<string>
}

export function cloudStorageSigner(projectId: string, bucketName: string): MediaSigner {
  const bucket = new Storage({ projectId }).bucket(bucketName)
  return {
    async upload(key, contentType, bytes) {
      const [policy] = await bucket.file(key).generateSignedPostPolicyV4({
        expires: Date.now() + 10 * 60 * 1000,
        fields: { 'Content-Type': contentType },
        conditions: [['content-length-range', bytes, bytes]],
      })
      return policy
    },
    async read(key) {
      const [url] = await bucket.file(key).getSignedUrl({ version: 'v4', action: 'read', expires: Date.now() + 5 * 60 * 1000, responseDisposition: 'attachment' })
      return url
    },
  }
}
