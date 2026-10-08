"use client";

import { useEffect, useEffectEvent, useRef, useState } from "react";
import jsQR from "jsqr";
import { Keyboard } from "lucide-react";
import { inviteCodeFromQr } from "./qr-code";

const EVERY_MS = 150;
const MAX_SIDE = 640; // decode a scaled-down frame: plenty for a QR held up close, light on a tablet

// The desk tablet's front camera, since the visitor holds their phone (or a printout) up to it.
// jsQR rather than the browser's BarcodeDetector, which Safari doesn't have.
export function QrScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const [notInvite, setNotInvite] = useState(false);
  const found = useEffectEvent(onCode);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let last = 0;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 } }, audio: false });
      } catch {
        setError("The camera isn't available. Please type the code instead.");
        return;
      }
      if (stopped) return stream.getTracks().forEach((t) => t.stop());
      const v = video.current!;
      v.srcObject = stream;
      await v.play().catch(() => {});
      const tick = (t: number) => {
        if (stopped) return;
        if (t - last > EVERY_MS && v.readyState >= 2 && v.videoWidth) {
          last = t;
          const scale = Math.min(1, MAX_SIDE / Math.max(v.videoWidth, v.videoHeight));
          canvas.width = Math.round(v.videoWidth * scale);
          canvas.height = Math.round(v.videoHeight * scale);
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
          const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const hit = jsQR(data, width, height, { inversionAttempts: "dontInvert" });
          if (hit) {
            const code = inviteCodeFromQr(hit.data);
            if (code) return found(code);
            setNotInvite(true);
          }
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    })();

    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="flex flex-1 flex-col">
      <h2 className="h-display mt-6 mb-2 text-[29px]">Scan your invite</h2>
      <p className="mb-4 text-[15.5px] text-ink-2">Hold the QR code from your invitation email up to the camera.</p>
      {error ? (
        <p role="alert" className="rounded-xl bg-[#FEE4E2] px-3.5 py-2.5 text-sm font-medium text-danger">{error}</p>
      ) : (
        <div className="relative aspect-square w-full overflow-hidden rounded-[20px] bg-[#16231D]">
          {/* Mirrored, like a selfie camera, so moving the phone left moves it left on screen. */}
          <video ref={video} muted playsInline className="size-full -scale-x-100 object-cover" />
          <span aria-hidden className="absolute inset-[18%] rounded-3xl border-4 border-white/85 shadow-[0_0_0_9999px_rgba(0,0,0,.35)]" />
        </div>
      )}
      <p role="status" className="mt-3 min-h-5 text-center text-[14px] font-medium text-warn-ink">
        {notInvite && !error && "That QR code isn't an invite. Try the one in your invitation email."}
      </p>
      <div className="flex-1" />
      <button className="btn-ghost mt-4 w-full" onClick={onClose}><Keyboard className="size-5" /> Type the code instead</button>
    </div>
  );
}
