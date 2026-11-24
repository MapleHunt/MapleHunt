import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { Button } from "../../components/ui";
import { parseInvite } from "../../data/partyKey";
import type { Invite } from "../../data/partyKey";

// In-app camera scanner for the party invite QR. Works with no signal.
// Uses the browser's BarcodeDetector where there is one (Android Chrome) and
// jsQR everywhere else (iPhone Safari).

interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<Array<{ rawValue: string }>>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (opts: { formats: string[] }) => BarcodeDetectorLike;
  }
}

export function QrScanner({ onInvite, onClose }: { onInvite: (invite: Invite) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [message, setMessage] = useState("Starting camera…");
  const done = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    let detector: BarcodeDetectorLike | null = null;
    try {
      if (window.BarcodeDetector) detector = new window.BarcodeDetector({ formats: ["qr_code"] });
    } catch {
      detector = null;
    }

    async function read(v: HTMLVideoElement): Promise<string | null> {
      if (detector) {
        try {
          return (await detector.detect(v))[0]?.rawValue ?? null;
        } catch {
          detector = null; // fall back to jsQR
        }
      }
      if (!ctx || !v.videoWidth) return null;
      // Scan a downscaled frame: fast enough on older phones.
      const scale = Math.min(1, 640 / v.videoWidth);
      canvas.width = Math.round(v.videoWidth * scale);
      canvas.height = Math.round(v.videoHeight * scale);
      ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
      return jsQR(img.data, img.width, img.height, { inversionAttempts: "dontInvert" })?.data ?? null;
    }

    async function tick() {
      const v = video.current;
      if (stopped || done.current || !v) return;
      const text = v.readyState >= 2 ? await read(v) : null;
      if (text) {
        const invite = parseInvite(text);
        if (invite) {
          done.current = true;
          onInvite(invite);
          return;
        }
        setMessage("That QR isn't a MapleHunt party invite.");
      }
      timer = setTimeout(() => void tick(), 200);
    }

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setMessage("This browser can't use the camera. Type the join code instead.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (stopped) return stream.getTracks().forEach((t) => t.stop());
        const v = video.current!;
        v.srcObject = stream;
        await v.play();
        setMessage("Point the camera at the tag holder's invite QR.");
        void tick();
      } catch (err) {
        const denied = err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "SecurityError");
        setMessage(denied ? "Camera permission is off. Allow it in your browser settings, or type the join code." : "Couldn't start the camera. Type the join code instead.");
      }
    })();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onInvite]);

  return (
    <div className="qr-scan" role="dialog" aria-modal="true" aria-label="Scan party invite QR">
      <div className="qr-scan-frame">
        <video ref={video} className="qr-scan-video" playsInline muted />
        <div className="qr-scan-target" aria-hidden="true" />
      </div>
      <p className="qr-scan-msg" role="status">
        {message}
      </p>
      <Button variant="outline" size="md" block onClick={onClose}>
        Cancel
      </Button>
    </div>
  );
}
