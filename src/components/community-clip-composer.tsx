"use client";

import { startTransition, useActionState, useEffect, useRef, useState, useTransition } from "react";
import type { FormEvent } from "react";
import { Film, Upload } from "lucide-react";
import { finalizeChannelClipUploadAction, requestClipUploadAction } from "@/lib/actions/clip";
import { myClipsForChannelAction, shareClipToChannelAction, type ShareableClip } from "@/lib/actions/community";
import { duration as formatDuration } from "@/lib/format";
import { putWithProgress } from "@/lib/upload-with-progress";
import { MAX_CLIP_BYTES, MAX_CLIP_DURATION_SEC, sniffVideoType, type SniffedVideoType } from "@/lib/video-sniff";

type Mode = "pick" | "upload";

/**
 * What a CLIPS-kind channel renders in place of CommunityPostComposer's
 * plain textarea — there's nothing to say without a clip attached (see the
 * CLIPS rejection in createCommunityPostAction). Two tabs for the two ways
 * to attach one: pick one of the member's own existing clips
 * (shareClipToChannelAction, no R2 traffic at all), or upload a fresh one
 * straight into the channel (finalizeChannelClipUploadAction) — which
 * reuses the exact same presigned-PUT step and 600MB/2-minute limits as
 * the standalone /clips/new form, see UploadClipForm.
 */
export function ClipsChannelComposer({
  channelId,
  channelName,
  canPostHere,
}: {
  channelId: string;
  channelName: string;
  canPostHere: boolean;
}) {
  const [mode, setMode] = useState<Mode>("pick");

  if (!canPostHere) {
    return (
      <p className="mb-3 border border-dashed border-line px-3 py-2.5 text-sm text-muted">
        Only moderators can post in #{channelName}.
      </p>
    );
  }

  return (
    <div className="mb-3 border border-line bg-surface p-2.5">
      <div className="mb-2.5 flex gap-1 border-b border-line pb-2.5">
        <button
          type="button"
          onClick={() => setMode("pick")}
          className={`btn ${mode === "pick" ? "btn-primary" : "btn-ghost"}`}
        >
          <Film size={13} /> Share a clip
        </button>
        <button
          type="button"
          onClick={() => setMode("upload")}
          className={`btn ${mode === "upload" ? "btn-primary" : "btn-ghost"}`}
        >
          <Upload size={13} /> Upload new
        </button>
      </div>
      {mode === "pick" ? (
        <SharePickerTab channelId={channelId} onUploadInstead={() => setMode("upload")} />
      ) : (
        <UploadTab channelId={channelId} />
      )}
    </div>
  );
}

/** "Pick one of your existing clips" tab. Fetches the caller's own clips
 * lazily on mount rather than the server component doing it up front —
 * this composer only ever renders for a signed-in member, but a channel
 * page load shouldn't pay for a clip listing on every visit when most
 * visits don't touch the composer at all. */
function SharePickerTab({ channelId, onUploadInstead }: { channelId: string; onUploadInstead: () => void }) {
  const [clips, setClips] = useState<ShareableClip[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startShare] = useTransition();

  useEffect(() => {
    myClipsForChannelAction().then(setClips);
  }, []);

  const submit = () => {
    if (!selectedId) return;
    setError(null);
    startShare(async () => {
      const result = await shareClipToChannelAction(channelId, selectedId, caption.trim());
      if ("error" in result) {
        setError(result.error);
      } else {
        setSelectedId(null);
        setCaption("");
      }
    });
  };

  if (clips === null) {
    return <p className="py-2 text-sm text-muted">Loading your clips…</p>;
  }

  if (clips.length === 0) {
    return (
      <p className="py-2 text-sm text-muted">
        You don&rsquo;t have any clips yet.{" "}
        <button type="button" onClick={onUploadInstead} className="text-signal hover:underline">
          Upload one
        </button>{" "}
        to share it here.
      </p>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <ul className="flex gap-2 overflow-x-auto pb-1">
        {clips.map((clip) => {
          const selected = clip.id === selectedId;
          return (
            <li key={clip.id} className="shrink-0">
              <button
                type="button"
                onClick={() => setSelectedId(clip.id)}
                aria-pressed={selected}
                className={`relative block w-20 border ${selected ? "border-signal" : "border-line"}`}
              >
                {clip.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={clip.thumbnailUrl} alt="" className="aspect-[9/16] w-full bg-ink object-cover" />
                ) : (
                  <div className="flex aspect-[9/16] w-full items-center justify-center bg-ink">
                    <Film size={16} className="text-faint" />
                  </div>
                )}
                <span className="tabular glass absolute bottom-1 right-1 px-1 py-0.5 text-[0.5625rem]">
                  {formatDuration(clip.durationSec)}
                </span>
              </button>
              <p className="mt-1 line-clamp-2 w-20 text-[0.6875rem] leading-snug text-faint">{clip.title}</p>
            </li>
          );
        })}
      </ul>

      <textarea
        value={caption}
        onChange={(event) => setCaption(event.target.value)}
        placeholder="Say something about it (optional)"
        rows={2}
        maxLength={280}
        disabled={isPending}
        className="input mt-2 w-full resize-none"
      />

      <div className="mt-2 flex items-center justify-between">
        {error ? (
          <p role="alert" className="text-[0.75rem] text-live">
            {error}
          </p>
        ) : (
          <span />
        )}
        <button type="submit" className="btn btn-primary" disabled={!selectedId || isPending}>
          {isPending ? "Sharing…" : "Share clip"}
        </button>
      </div>
    </form>
  );
}

/** "Upload a new clip" tab — the same multi-step direct-to-R2 flow as
 * UploadClipForm (/clips/new): sniff client-side, read duration off the
 * preview <video>, request a presigned PUT, upload with progress, then
 * hand off to finalizeChannelClipUploadAction, which re-validates
 * everything server-side against the real uploaded bytes (see
 * prepareClipUpload in actions/clip.ts) before creating the Clip and the
 * channel post together. No game selector here — unlike the standalone
 * upload form, this is a quick "share what I just recorded" flow, not a
 * fully categorised upload. */
function UploadTab({ channelId }: { channelId: string }) {
  const [state, dispatch, pending] = useActionState(finalizeChannelClipUploadAction, undefined);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [durationSec, setDurationSec] = useState<number | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [sniffedType, setSniffedType] = useState<SniffedVideoType | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const durationReadRef = useRef(false);

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
      setUploadError(error instanceof Error ? error.message : "Upload failed. Try again.");
      setProgress(null);
      return;
    }

    const payload = new FormData();
    payload.set("channelId", channelId);
    payload.set("title", String(rawFields.get("title") ?? ""));
    payload.set("caption", String(rawFields.get("caption") ?? ""));
    payload.set("key", requested.key);
    payload.set("durationSec", String(durationSec));
    setProgress(null);

    startTransition(() => {
      dispatch(payload);
    });
  };

  const uploading = progress !== null;

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="file"
        accept="video/*"
        required
        disabled={uploading || pending}
        className="input w-full"
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
          className="mt-2 aspect-[9/16] w-full max-w-[160px] bg-ink object-cover"
          onLoadedMetadata={(event) => onMetadataReady(event.currentTarget)}
        />
      )}

      {uploading && (
        <div className="mt-2">
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

      <input
        type="text"
        name="title"
        placeholder="Title"
        required
        maxLength={80}
        disabled={uploading || pending}
        className="input mt-2 w-full"
      />
      {state?.fieldErrors?.title && (
        <p role="alert" className="mt-1 text-[0.75rem] text-live">
          {state.fieldErrors.title}
        </p>
      )}

      <textarea
        name="caption"
        placeholder="Say something about it (optional)"
        rows={2}
        maxLength={280}
        disabled={uploading || pending}
        className="input mt-2 w-full resize-none"
      />
      {state?.fieldErrors?.caption && (
        <p role="alert" className="mt-1 text-[0.75rem] text-live">
          {state.fieldErrors.caption}
        </p>
      )}

      {state?.error && (
        <p role="alert" className="mt-2 text-[0.75rem] text-live">
          {state.error}
        </p>
      )}

      <div className="mt-2 flex justify-end">
        <button className="btn btn-primary" disabled={!durationSec || uploading || pending}>
          {uploading ? `Uploading… ${progress}%` : pending ? "Sharing…" : "Upload & share"}
        </button>
      </div>
    </form>
  );
}
