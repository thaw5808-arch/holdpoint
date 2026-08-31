/** Shared by /login and /register — a plain link to the OAuth entry point
 * (no client state needed, it's just a navigation) styled as a full-width
 * .btn like the primary submit button above it. */
export function OrDivider() {
  return (
    <div className="my-5 flex items-center gap-3" aria-hidden="true">
      <div className="h-px flex-1 bg-line" />
      <span className="eyebrow text-faint">Or</span>
      <div className="h-px flex-1 bg-line" />
    </div>
  );
}

export function ContinueWithGoogle() {
  return (
    <a href="/api/auth/google" className="btn w-full">
      <GoogleGlyph />
      Continue with Google
    </a>
  );
}

function GoogleGlyph() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M46.5 24.5c0-1.6-.15-3.15-.42-4.64H24v9.02h12.66c-.55 2.85-2.2 5.27-4.68 6.9v5.72h7.57C43.86 37.36 46.5 31.45 46.5 24.5Z"
      />
      <path
        fill="#34A853"
        d="M24 47c6.3 0 11.6-2.08 15.45-5.63l-7.57-5.72c-2.1 1.4-4.78 2.24-7.88 2.24-6.06 0-11.2-4.09-13.03-9.6H3.14v5.9C6.98 41.98 14.86 47 24 47Z"
      />
      <path fill="#FBBC05" d="M10.97 28.29c-.47-1.4-.73-2.9-.73-4.29s.26-2.89.73-4.29v-5.9H3.14A22.9 22.9 0 0 0 1 24c0 3.7.9 7.2 2.14 10.19l7.83-5.9Z" />
      <path
        fill="#EA4335"
        d="M24 10.75c3.43 0 6.5 1.18 8.92 3.48l6.7-6.7C35.6 3.68 30.3 1 24 1 14.86 1 6.98 6.02 3.14 13.81l7.83 5.9c1.83-5.51 6.97-9.6 13.03-9.6Z"
      />
    </svg>
  );
}
