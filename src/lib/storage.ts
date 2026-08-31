import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";

/**
 * Provider-agnostic object storage. Nothing outside this file should know
 * or care that the current implementation happens to be R2 — callers get
 * a key back from `put` and use it with `delete`/`getUrl` later, same as
 * they would against S3, GCS, or local disk.
 *
 * Deliberately no `get`/`read`: nothing in this app treats a whole object's
 * bytes as something to load into memory at once. `getUrl` hands back a
 * short-lived, time-limited link instead — see
 * src/app/api/avatars/[...key]/route.ts, which redirects a browser to it
 * directly, and src/app/api/clips/[...key]/route.ts, which fetches it
 * server-side so it can forward Range requests (a redirect alone doesn't
 * give a <video> reliable seeking).
 *
 * `put` is for small, already-in-memory buffers (avatars, capped at 2MB —
 * small enough to read fully into this process without a second thought).
 * Anything bigger — clip video — goes through `putUrl` instead: the
 * browser PUTs straight to R2 and these bytes never pass through this
 * process at all, which matters because Server Actions cap request bodies
 * at 1MB regardless of what this file does. `contentLength` gets baked
 * into the signature, so a client can't upload more than what was
 * authorized (a mismatched Content-Length header just fails the PUT with
 * SignatureDoesNotMatch) — but Content-Type is *not* signature-enforced by
 * this SDK, so it's cosmetic only: the actual "is this really a video"
 * check has to happen after the fact, by reading real bytes back. See
 * uploadClipAction's verify step.
 */
export interface Storage {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  delete(key: string): Promise<void>;
  getUrl(key: string): Promise<string>;
  putUrl(key: string, contentType: string, contentLength: number): Promise<string>;
}

const URL_TTL_SECONDS = 300;
// A multi-megabyte browser upload needs more headroom than a signed GET
// does — and needs to stay ahead of MAX_CLIP_BYTES (video-sniff.ts): at
// 600MB, even a modest ~3 Mbps sustained upload takes ~27 minutes, so this
// has to comfortably clear that, not just a fast connection's case. 30
// minutes covers a sustained upload speed down to ~2.7 Mbps; raising the
// size cap further should mean revisiting this number too.
const UPLOAD_URL_TTL_SECONDS = 1800;

/** R2 speaks the S3 API, so the regular S3 SDK works against it unmodified
 * once pointed at R2's account-scoped endpoint with region "auto". */
class R2Storage implements Storage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    this.bucket = env.R2_BUCKET;
    this.client = new S3Client({
      region: "auto",
      endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID,
        secretAccessKey: env.R2_SECRET_ACCESS_KEY,
      },
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async getUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: URL_TTL_SECONDS });
  }

  async putUrl(key: string, contentType: string, contentLength: number): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
      ContentLength: contentLength,
    });
    return getSignedUrl(this.client, command, { expiresIn: UPLOAD_URL_TTL_SECONDS });
  }
}

export const storage: Storage = new R2Storage();
