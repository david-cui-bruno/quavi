import { Storage } from "@google-cloud/storage";

export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
export interface MediaSigner {
  upload(
    key: string,
    contentType: string,
    bytes: number,
  ): Promise<{ url: string; fields: Record<string, string> }>;
  read(key: string): Promise<string>;
  verify(
    key: string,
    contentType: string,
    bytes: number | null,
  ): Promise<number>;
  finalize(
    key: string,
    contentType: string,
    bytes: number | null,
  ): Promise<{ key: string; bytes: number }>;
  cleanupStaging(): Promise<void>;
  remove(key: string): Promise<void>;
  removeOwner(owner: string): Promise<void>;
}

export function cloudStorageSigner(
  projectId: string,
  bucketName: string,
): MediaSigner {
  const bucket = new Storage({ projectId }).bucket(bucketName);
  const adapter: MediaSigner = {
    async upload(key, contentType, bytes) {
      const [policy] = await bucket.file(key).generateSignedPostPolicyV4({
        expires: Date.now() + 10 * 60 * 1000,
        fields: { "Content-Type": contentType },
        conditions: [["content-length-range", bytes, bytes]],
      });
      return policy;
    },
    async verify(key, contentType, bytes) {
      const file = bucket.file(key);
      const [meta] = await file.getMetadata();
      const actual = Number(meta.size);
      if (
        meta.contentType !== contentType ||
        actual > MAX_PHOTO_BYTES ||
        actual <= 0 ||
        (bytes !== null && actual !== bytes)
      )
        throw Object.assign(new Error("Invalid photo"), { statusCode: 400 });
      const [head] = await file.download({
        start: 0,
        end: 11,
        validation: false,
      });
      const valid =
        contentType === "image/jpeg"
          ? head[0] === 255 && head[1] === 216 && head[2] === 255
          : contentType === "image/png"
            ? head
                .subarray(0, 8)
                .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            : head.toString("ascii", 0, 4) === "RIFF" &&
              head.toString("ascii", 8, 12) === "WEBP";
      if (!valid)
        throw Object.assign(new Error("Invalid photo"), { statusCode: 400 });
      return actual;
    },
    async finalize(key, contentType, bytes) {
      const finalKey = key.replace(/^pending\//, "users/");
      if (finalKey !== key) {
        await adapter.verify(key, contentType, bytes);
        try {
          await bucket
            .file(key)
            .copy(bucket.file(finalKey), {
              preconditionOpts: { ifGenerationMatch: 0 },
            });
        } catch (error) {
          if ((error as { code?: number }).code !== 412) throw error;
        }
      }
      const actual = await adapter.verify(finalKey, contentType, bytes);
      return { key: finalKey, bytes: actual };
    },
    async cleanupStaging() {
      const [files] = await bucket.getFiles({
        prefix: "pending/",
        maxResults: 1000,
        autoPaginate: false,
      });
      for (const file of files)
        if (
          file.metadata.timeCreated &&
          Date.now() - new Date(file.metadata.timeCreated).getTime() >
            24 * 3600000
        )
          await file.delete({ ignoreNotFound: true });
    },
    async remove(key) {
      await bucket.file(key).delete({ ignoreNotFound: true });
    },
    async removeOwner(owner) {
      for (const prefix of ["users", "pending"])
        await bucket.deleteFiles({
          prefix: `${prefix}/${owner}/`,
          force: false,
        });
    },
    async read(key) {
      const [url] = await bucket
        .file(key)
        .getSignedUrl({
          version: "v4",
          action: "read",
          expires: Date.now() + 5 * 60 * 1000,
          responseDisposition: "attachment",
        });
      return url;
    },
  };
  return adapter;
}
