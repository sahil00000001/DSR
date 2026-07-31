"use client";

import { useEffect, useRef, useState } from "react";
import { Circle, Mic, Square, Trash2, Video } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/utils/format";

/**
 * Records a voice note or a short video, in the browser.
 *
 * Section 2 of the brief asks for audio and video *recordings* rather than uploads,
 * and on a shop floor that is the difference between an update getting written and
 * not: describing a bearing noise in prose is hard, and holding a phone to it is easy.
 *
 * ## No dependency
 *
 * `MediaRecorder` is built in. The output container is whatever the browser offers —
 * `audio/webm` on Chrome and Firefox, `audio/mp4` on Safari — which is why the
 * storage bucket accepts a range of media types rather than one.
 *
 * ## Permission is asked for at the moment it is needed
 *
 * `getUserMedia` is called when Record is pressed, not on mount. A page that asks for
 * the microphone the instant it loads gets denied, and once denied the browser
 * remembers.
 *
 * ## The stream is always released
 *
 * Every exit path stops the tracks. A live `MediaStream` left running keeps the
 * recording indicator lit in the tab strip, which reads as the app listening after
 * you have finished — the kind of detail that loses trust permanently.
 */

const MAX_SECONDS = 180;

type Phase = "idle" | "requesting" | "recording" | "ready" | "denied" | "unsupported";

export interface Recording {
  file: File;
  url: string;
  kind: "audio" | "video";
  seconds: number;
}

export function MediaRecorderField({
  kind,
  onRecorded,
  disabled,
}: {
  kind: "audio" | "video";
  onRecorded: (recording: Recording) => void;
  disabled?: boolean;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Recording | null>(null);

  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const videoPreview = useRef<HTMLVideoElement | null>(null);

  /** Releases the camera/microphone and clears the tick. Safe to call twice. */
  function release() {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
  }

  // Belt and braces: navigating away mid-recording must not leave the light on.
  useEffect(() => release, []);

  async function start() {
    setError(null);

    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setPhase("unsupported");
      setError("This browser can't record. You can still attach a file instead.");
      return;
    }

    setPhase("requesting");

    try {
      const media = await navigator.mediaDevices.getUserMedia(
        kind === "audio" ? { audio: true } : { audio: true, video: { facingMode: "environment" } },
      );
      stream.current = media;

      if (kind === "video" && videoPreview.current) {
        videoPreview.current.srcObject = media;
        await videoPreview.current.play().catch(() => {
          // Autoplay refusal is harmless — the recording still runs.
        });
      }

      chunks.current = [];
      const instance = new MediaRecorder(media);
      recorder.current = instance;

      instance.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data);
      };

      instance.onstop = () => {
        release();

        const type = instance.mimeType || (kind === "audio" ? "audio/webm" : "video/webm");
        const blob = new Blob(chunks.current, { type });
        // Extension taken from the container the browser actually produced, so the
        // stored file opens in whatever the recipient uses.
        const extension = type.includes("mp4") ? (kind === "audio" ? "m4a" : "mp4") : "webm";
        const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
        const file = new File([blob], `${kind}-note-${stamp}.${extension}`, { type });

        const recording: Recording = {
          file,
          url: URL.createObjectURL(blob),
          kind,
          seconds,
        };
        setPreview(recording);
        setPhase("ready");
        onRecorded(recording);
      };

      instance.start();
      setSeconds(0);
      setPhase("recording");

      timer.current = setInterval(() => {
        setSeconds((value) => {
          // Hard stop, so nobody accidentally uploads a 40-minute video.
          if (value + 1 >= MAX_SECONDS) {
            instance.state === "recording" && instance.stop();
            return MAX_SECONDS;
          }
          return value + 1;
        });
      }, 1000);
    } catch (cause) {
      release();
      const name = cause instanceof DOMException ? cause.name : "";
      setPhase(name === "NotAllowedError" ? "denied" : "idle");
      setError(
        name === "NotAllowedError"
          ? `${kind === "audio" ? "Microphone" : "Camera"} access was blocked. Allow it in your browser settings, or attach a file instead.`
          : name === "NotFoundError"
            ? `No ${kind === "audio" ? "microphone" : "camera"} found on this device.`
            : "Recording could not start. You can still attach a file instead.",
      );
    }
  }

  function stop() {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }

  function discard() {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
    setPhase("idle");
    setSeconds(0);
  }

  const Icon = kind === "audio" ? Mic : Video;
  const label = kind === "audio" ? "Record a voice note" : "Record a video";

  return (
    <div className="space-y-2">
      {phase === "recording" ? (
        <div className="space-y-2">
          {kind === "video" ? (
            <video
              ref={videoPreview}
              muted
              playsInline
              className="w-full rounded-lg border border-border bg-black"
            />
          ) : null}

          <div className="flex items-center justify-between gap-3 rounded-lg border border-danger/30 bg-danger-soft/40 px-3 py-2">
            <span className="flex items-center gap-2 text-[13px] font-medium text-danger-text">
              <Circle className="size-2.5 animate-pulse fill-current" aria-hidden="true" />
              Recording {formatSeconds(seconds)}
              <span className="text-[11px] font-normal text-fg-subtle">
                / {formatSeconds(MAX_SECONDS)} max
              </span>
            </span>
            <Button type="button" size="xs" variant="danger" onClick={stop}>
              <Square className="size-3" />
              Stop
            </Button>
          </div>
        </div>
      ) : preview ? (
        <div className="space-y-2 rounded-lg border border-border bg-surface-inset p-2.5">
          {preview.kind === "audio" ? (
            <audio src={preview.url} controls className="w-full" />
          ) : (
            <video src={preview.url} controls playsInline className="w-full rounded-md" />
          )}
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11.5px] text-fg-subtle">
              {formatSeconds(preview.seconds)} · {formatBytes(preview.file.size)} · attaches when
              you post
            </p>
            <Button type="button" size="xs" variant="ghost" onClick={discard}>
              <Trash2 className="size-3" />
              Discard
            </Button>
          </div>
        </div>
      ) : (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={start}
          disabled={disabled || phase === "requesting" || phase === "unsupported"}
          loading={phase === "requesting"}
        >
          <Icon className="size-4" />
          {label}
        </Button>
      )}

      {error ? (
        <p
          role="alert"
          className={cn(
            "text-[12px] leading-[17px]",
            phase === "denied" ? "text-danger-text" : "text-fg-muted",
          )}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

function formatSeconds(total: number): string {
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}
