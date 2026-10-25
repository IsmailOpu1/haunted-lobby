// What /health reports about voice, so a deploy problem can be diagnosed from a browser.
// Only whether each setting is present is shown, never its value.

const MAX_ERROR_LENGTH = 300;

const lastStart: { ok: string | null; error: string | null } = { ok: null, error: null };

export function recordVoiceStart(error?: unknown) {
  const now = new Date().toISOString();
  if (error === undefined) {
    lastStart.ok = now;
    lastStart.error = null;
  } else {
    const message = error instanceof Error ? error.message : String(error);
    lastStart.error = `${now}: ${message}`.slice(0, MAX_ERROR_LENGTH);
  }
}

export function voiceHealth() {
  const has = (name: string) => Boolean(process.env[name]);
  return {
    settings: {
      LIVEKIT_URL: has("LIVEKIT_URL"),
      LIVEKIT_API_KEY: has("LIVEKIT_API_KEY"),
      LIVEKIT_API_SECRET: has("LIVEKIT_API_SECRET"),
    },
    lastStartOk: lastStart.ok,
    lastStartError: lastStart.error,
  };
}
