"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { finalizeClipUploadAction, requestClipUploadAction } from "@/lib/actions/clip";
import { duration as formatDuration } from "@/lib/format";
import { MAX_CLIP_BYTES, MAX_CLIP_DURATION_SEC, sniffVideoType, type SniffedVideoType } from "@/lib/video-sniff";

/** Wraps a presigned-URL PUT in a Promise, reporting upload progress along
 * the way. XMLHttpRequest rather than fetch — fetch has no upload
 * progress event, and a clip can be tens of megabytes on a slow
 * connection, so a silent "Uploading…" with no indication of how far
 * along it is would be a bad time. */
function putWithProgress(url: string, file: Blob, contentType: string, onProgress: (pct: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    // A response actually came back, just not a success one (an expired
    // or already-used presigned URL, most likely) — CORS isn't the
    // culprit here, since a CORS-blocked request never reaches `onload`
    // at all; it fails via `onerror` below instead.
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Storage rejected the upload (${xhr.status}). The upload link may have expired — try again.`));
    };
    // No response reached the browser at all. The R2 endpoint is a
    // different origin from this app, and this fires right after
    // requestClipUploadAction (a same-origin call) just succeeded, so a
    // real network outage would be an odd coincidence — this is almost
    // always the bucket's CORS policy rejecting the browser's direct PUT.
    // Worded to point at the likely fix without ruling out an actual
    // connection drop.
    xhr.onerror = () =>
      reject(
        new Error(
          "Couldn't reach storage to upload this file. This is usually a CORS setting on the storage bucket rather than your connection — see the README's R2 setup if it keeps happening.",
        ),
      );
    xhr.send(file);
  });
}

/**
 * Upload form for /clips/new. The video never passes through a Server
 * Action — those cap request bodies at 1MB — so this drives a multi-step
 * flow instead:
 *
 * 1. Sniff the file's magic bytes client-side (fast-fail UX only; the
 *    server re-checks after upload regardless).
 * 2. Once the preview <video> has metadata, read its duration — sent
 *    along at finalize time so the server knows where "about 1s in" is
 *    for its own poster extraction, without having to re-derive it.
 * 3. requestClipUploadAction authorizes a direct-to-R2 PUT for the video
 *    and returns a presigned URL; the browser uploads straight to it,
 *    with XHR progress driving the bar below.
 * 4. finalizeClipUploadAction reads the real bytes back off the object
 *    and only then creates the Clip row — the poster is extracted
 *    server-side at that point too (see extractPosterFrame in
 *    @/lib/poster), by seeking into the now-uploaded video with ffmpeg.
 *    Nothing here captures a frame client-side anymore: doing it after
 *    the upload, from the file R2 actually has, was the only way to stop
 *    getting an occasional blank poster from a decoder that hadn't
 *    painted yet — see the history on extractPosterFrame for what led
 *    here.
 */
export function UploadClipForm({ games }: { games: { slug: string; name: string }[] }) {
  const [state, dispatch, pending] = useActionState(finalizeClipUploadAction, undefined);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [sniffedType, setSniffedType] = useState<SniffedVideoType | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  // Guards against reading duration twice: onLoadedMetadata (below) and
  // the readyState effect (further down) both call this once metadata is
  // available, and only one of them will actually be first.
  const durationReadRef = useRef(false);

  // Revokes the previous object URL whenever a new one replaces it, and
  // the current one on unmount.
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const resetFile = () => {
    setVideoFile(null);
    setSniffedType(null);
    setDurationSec(null);
    setPreviewUrl(null);
    durationReadRef.current = false;
  };

  // Called once metadata is actually available, from whichever of the two
  // paths below notices first. This is also where the duration cap gets
  // checked — the file's real length isn't known any earlier than this,
  // unlike size and type which handleFile below can reject before a
  // preview even renders. A rejection here resets the file exactly the
  // same way handleFile's own checks do: no upload gets requested for it.
  const onMetadataReady = (video: HTMLVideoElement) => {
    if (durationReadRef.current) return;
    durationReadRef.current = true;
    const seconds = Math.round(video.duration);
    if (seconds > MAX_CLIP_DURATION_SEC) {
      setFileError(`Keep it under ${formatDuration(MAX_CLIP_DURATION_SEC)} long.`);
      resetFile();
      return;
    }
    setDurationSec(seconds);
  };

  // onLoadedMetadata below covers the normal case, where React's listener
  // attaches before the browser finishes loading metadata. But that
  // listener goes on the DOM node during hydration/commit, and (as found
  // with ClipStage's own video) a fast-loading local blob: URL can have
  // its metadata ready before React gets there — the event fires once,
  // to no one, and is gone. This checks readyState directly once mounted
  // so duration still gets read even when that happens.
  useEffect(() => {
    const video = previewVideoRef.current;
    if (!video) return;
    if (video.readyState >= 1) onMetadataReady(video);
  }, [previewUrl]);

  const handleFile = async (file: File | undefined) => {
    setFileError(null);
    setUploadError(null);
    resetFile();
    if (!file) return;

    if (file.size === 0) {
      setFileError("That file is empty.");
      return;
    }
    if (file.size > MAX_CLIP_BYTES) {
      setFileError(`Keep it under ${Math.floor(MAX_CLIP_BYTES / (1024 * 1024))}MB.`);
      return;
    }

    // Only the actual bytes decide what this is — a renamed file with a
    // video/* browser-guessed type would otherwise sail through. This is
    // still just a client-side courtesy: finalizeClipUploadAction repeats
    // the same check against the bytes R2 actually received.
    const head = new Uint8Array(await file.slice(0, 64).arrayBuffer());
    const type = sniffVideoType(head);
    if (!type) {
      setFileError("That doesn't look like a video file.");
      return;
    }

    setSniffedType(type);
    setVideoFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setUploadError(null);
    if (!videoFile || !sniffedType || !durationSec) return;

    // `new FormData(event.currentTarget)` would be the natural way to read
    // these, but the file input lives in this same <form> (see the label
    // just above it) — that captures the video File as a "file" entry
    // right alongside them. Read only the three text fields we actually
    // want out of it instead of handing that object on to the server
    // action wholesale; the payload sent to finalizeClipUploadAction
    // below is built fresh, field by field, so there's no whole-form
    // object it could ever be leaking out of.
    const rawFields = new FormData(event.currentTarget);

    setProgress(0);
    const requested = await requestClipUploadAction(videoFile.size, sniffedType);
    if ("error" in requested) {
      setUploadError(requested.error);
      setProgress(null);
      return;
    }

    try {
      await putWithProgress(requested.uploadUrl, videoFile, sniffedType, setProgress);
    } catch (error) {
      // putWithProgress's rejection message already distinguishes a CORS
      // block from a genuine rejected/expired upload link — surface it
      // as-is rather than flattening both into one generic message.
      setUploadError(error instanceof Error ? error.message : "Upload failed. Try again.");
      setProgress(null);
      return;
    }

    // Only metadata and the storage key ever go to finalizeClipUploadAction
    // — never the video itself, which is already sitting in R2 by this
    // point and would blow well past a Server Action's 1MB body cap. The
    // poster isn't sent from here at all anymore — finalizeClipUploadAction
    // extracts it server-side, straight out of the object R2 now holds.
    const payload = new FormData();
    payload.set("title", String(rawFields.get("title") ?? ""));
    payload.set("caption", String(rawFields.get("caption") ?? ""));
    payload.set("game", String(rawFields.get("game") ?? ""));
    payload.set("key", requested.key);
    payload.set("durationSec", String(durationSec));
    setProgress(null);

    // dispatch is the action returned by useActionState — a <form
    // action={dispatch}> would wrap this in a transition automatically,
    // but calling it directly (needed here, since the presign+PUT above
    // has to finish first) throws "called outside of a transition"
    // unless it's wrapped explicitly.
    startTransition(() => {
      dispatch(payload);
    });
  };

  const uploading = progress !== null;

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-xl px-4 py-8">
      <p className="eyebrow mb-2">Clips</p>
      <h1 className="display mb-1 text-2xl uppercase tracking-[0.04em]">Upload a clip</h1>
      <p className="mb-6 text-sm text-muted">
        Vertical clips fit the feed best, but any orientation works.
      </p>

      <div className="space-y-5">
        <div>
          <label htmlFor="file" className="eyebrow mb-1.5 block">
            Video file
          </label>
          <input
            id="file"
            name="file"
            type="file"
            accept="video/*"
            required
            disabled={uploading || pending}
            className="input"
            onChange={(event) => void handleFile(event.target.files?.[0])}
          />
          <p className="mt-1 text-[0.75rem] text-faint">
            Up to {Math.floor(MAX_CLIP_BYTES / (1024 * 1024))}MB, {formatDuration(MAX_CLIP_DURATION_SEC)} long.
          </p>

          {previewUrl && (
            <video
              ref={previewVideoRef}
              src={previewUrl}
              controls
              muted
              className="mt-3 aspect-[9/16] w-full max-w-[220px] bg-ink object-cover"
              // Covers the normal case: metadata still loading when this
              // attaches. The readyState effect above covers the case
              // where it already finished before React got here.
              onLoadedMetadata={(event) => onMetadataReady(event.currentTarget)}
            />
          )}

          {uploading && (
            <div className="mt-3">
              <div className="h-1 w-full bg-line">
                <div className="h-full bg-signal transition-[width]" style={{ width: `${progress}%` }} />
              </div>
              <p className="tabular mt-1 text-[0.75rem] text-faint">Uploading… {progress}%</p>
            </div>
          )}

          {(fileError ?? uploadError ?? state?.fieldErrors?.file) && (
            <p role="alert" className="mt-1 text-[0.75rem] text-live">
              {fileError ?? uploadError ?? state?.fieldErrors?.file}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="title" className="eyebrow mb-1.5 block">
            Title
          </label>
          <input id="title" name="title" type="text" required maxLength={80} className="input" />
          {state?.fieldErrors?.title && (
            <p role="alert" className="mt-1 text-[0.75rem] text-live">
              {state.fieldErrors.title}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="caption" className="eyebrow mb-1.5 block">
            Caption
          </label>
          <textarea
            id="caption"
            name="caption"
            rows={3}
            maxLength={280}
            placeholder="What happened here?"
            className="input resize-none"
          />
          {state?.fieldErrors?.caption && (
            <p role="alert" className="mt-1 text-[0.75rem] text-live">
              {state.fieldErrors.caption}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="game" className="eyebrow mb-1.5 block">
            Game
          </label>
          <select id="game" name="game" defaultValue="" className="input">
            <option value="">No game</option>
            {games.map((game) => (
              <option key={game.slug} value={game.slug}>
                {game.name}
              </option>
            ))}
          </select>
          {state?.fieldErrors?.game && (
            <p role="alert" className="mt-1 text-[0.75rem] text-live">
              {state.fieldErrors.game}
            </p>
          )}
        </div>
      </div>

      {state?.error && (
        <p role="alert" className="mt-5 border border-live/50 bg-live/10 px-3 py-2 text-sm text-live">
          {state.error}
        </p>
      )}

      <div className="mt-8 flex items-center justify-end border-t border-line pt-5">
        <button className="btn btn-primary" disabled={!durationSec || uploading || pending}>
          {uploading ? `Uploading… ${progress}%` : pending ? "Finishing…" : "Upload clip"}
        </button>
      </div>
    </form>
  );
}
