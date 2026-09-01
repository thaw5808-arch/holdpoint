/**
 * Wraps a presigned-URL PUT in a Promise, reporting upload progress along
 * the way. XMLHttpRequest rather than fetch — fetch has no upload progress
 * event, and a clip can be hundreds of megabytes on a slow connection, so
 * a silent "Uploading…" with no indication of how far along it is would be
 * a bad time. Shared by every direct-to-R2 upload flow in the app (the
 * standalone /clips/new form and the CLIPS-channel "upload a new clip"
 * composer) rather than each keeping its own copy.
 */
export function putWithProgress(url: string, file: Blob, contentType: string, onProgress: (pct: number) => void) {
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
    // different origin from this app, and this fires right after a
    // same-origin presign call just succeeded, so a real network outage
    // would be an odd coincidence — this is almost always the bucket's
    // CORS policy rejecting the browser's direct PUT. Worded to point at
    // the likely fix without ruling out an actual connection drop.
    xhr.onerror = () =>
      reject(
        new Error(
          "Couldn't reach storage to upload this file. This is usually a CORS setting on the storage bucket rather than your connection — see the README's R2 setup if it keeps happening.",
        ),
      );
    xhr.send(file);
  });
}
