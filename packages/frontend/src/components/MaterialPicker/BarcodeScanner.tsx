import { useEffect, useRef } from 'react';
import { Box } from '@mui/material';

/**
 * The window-global `BarcodeDetector`, typed loosely: it is a Chrome/Edge-only
 * API with no `lib.dom.d.ts` entry yet, and this component is the only place
 * that needs to know its shape.
 */
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: CanvasImageSource): Promise<DetectedBarcode[]>;
}
interface BarcodeDetectorConstructor {
  new (options?: { formats: string[] }): BarcodeDetectorLike;
}

const BARCODE_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];

/**
 * True when this browser can plausibly put a live camera stream on screen at
 * all. Both decode paths below (`BarcodeDetector` and the `@zxing/browser`
 * fallback) need a `MediaStream`, so this one check is what "unsupported
 * browser hides the camera button rather than throwing" (#207) tests against
 * — there is no point offering a scan button that can only ever fail.
 */
export function isCameraScanSupported(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.mediaDevices?.getUserMedia === 'function';
}

export type BarcodeScanErrorKind = 'denied' | 'unsupported';

/**
 * The live camera view, decoding barcodes as they cross it.
 *
 * Kept separate from `MaterialPicker` so the two testing concerns split
 * cleanly: this file's own tests exercise the decode paths (mocking
 * `getUserMedia`, `BarcodeDetector`, `@zxing/browser`), while
 * `MaterialPicker.test.tsx` mocks this whole component and only asserts on
 * what a detected/failed scan does to the lines list.
 *
 * Prefers the native `BarcodeDetector` (fast, on-device, no bundle weight)
 * and falls back to `@zxing/browser`'s pure-JS decoder — loaded lazily so the
 * common case never pays for it.
 */
export const BarcodeScanner = ({
  onDetect,
  onError,
}: {
  onDetect: (code: string) => void;
  onError: (kind: BarcodeScanErrorKind) => void;
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  // Stable across re-renders so a parent re-render (adding a line, say) never
  // tears the camera stream down and restarts it mid-scan.
  const onDetectRef = useRef(onDetect);
  onDetectRef.current = onDetect;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    if (!isCameraScanSupported()) {
      onErrorRef.current('unsupported');
      return undefined;
    }

    let stream: MediaStream | null = null;
    let stopped = false;
    let rafHandle: number | null = null;
    // `@zxing/browser`'s scan-loop handle, only obtained when it's actually needed.
    let zxingControls: { stop: () => void } | null = null;
    // De-dupes the same code re-read from consecutive frames into one tap —
    // "the scanner stays open for the next code" (#207) means a *different*
    // code, not the same box re-detected sixty times a second.
    let lastCode: { value: string; at: number } | null = null;

    const handleCode = (code: string) => {
      const now = Date.now();
      if (lastCode && lastCode.value === code && now - lastCode.at < 1500) return;
      lastCode = { value: code, at: now };
      onDetectRef.current(code);
    };

    const runDetectorLoop = (detector: BarcodeDetectorLike, video: HTMLVideoElement) => {
      const tick = async () => {
        if (stopped) return;
        try {
          const results = await detector.detect(video);
          if (results[0]?.rawValue) handleCode(results[0].rawValue);
        } catch {
          // A frame mid-transition (video not yet ready, tab backgrounded) —
          // transient, and the next frame tries again.
        }
        rafHandle = window.requestAnimationFrame(tick);
      };
      rafHandle = window.requestAnimationFrame(tick);
    };

    const runZxingLoop = async (video: HTMLVideoElement) => {
      const { BrowserMultiFormatReader } = await import('@zxing/browser');
      if (stopped) return;
      const reader = new BrowserMultiFormatReader();
      const controls = await reader.decodeFromVideoElement(video, (result) => {
        if (result) handleCode(result.getText());
      });
      if (stopped) {
        controls.stop();
        return;
      }
      zxingControls = controls;
    };

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      } catch {
        onErrorRef.current('denied');
        return;
      }
      if (stopped) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play().catch(() => undefined);
      if (stopped) return;

      const Detector = (window as unknown as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
      if (Detector) {
        runDetectorLoop(new Detector({ formats: BARCODE_FORMATS }), video);
      } else {
        void runZxingLoop(video);
      }
    };

    void start();

    return () => {
      stopped = true;
      if (rafHandle !== null) window.cancelAnimationFrame(rafHandle);
      zxingControls?.stop();
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return (
    <Box
      component="video"
      ref={videoRef}
      muted
      playsInline
      autoPlay
      sx={{ width: '100%', maxHeight: 320, borderRadius: 1, backgroundColor: 'common.black', objectFit: 'cover' }}
    />
  );
};
