import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { BarcodeScanner, isCameraScanSupported } from './BarcodeScanner';

vi.mock('@zxing/browser', () => ({
  BrowserMultiFormatReader: vi.fn().mockImplementation(() => ({
    decodeFromVideoElement: vi.fn((_video: HTMLVideoElement, callback: (result: { getText(): string }) => void) => {
      callback({ getText: () => 'ZXING-CODE' });
      return Promise.resolve({ stop: vi.fn() });
    }),
  })),
}));

function setMediaDevices(value: { getUserMedia: ReturnType<typeof vi.fn> } | undefined) {
  Object.defineProperty(navigator, 'mediaDevices', { value, configurable: true });
}

function fakeStream(): MediaStream {
  return { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream;
}

beforeEach(() => {
  // jsdom doesn't implement `<video>.play()` — real browsers resolve once
  // playback starts, which is all the component waits on.
  HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
});

afterEach(() => {
  setMediaDevices(undefined);
  delete (window as unknown as { BarcodeDetector?: unknown }).BarcodeDetector;
});

describe('isCameraScanSupported', () => {
  it('is false without a mediaDevices.getUserMedia', () => {
    setMediaDevices(undefined);
    expect(isCameraScanSupported()).toBe(false);
  });

  it('is true when getUserMedia exists', () => {
    setMediaDevices({ getUserMedia: vi.fn() });
    expect(isCameraScanSupported()).toBe(true);
  });
});

describe('the barcode scanner', () => {
  it('reports "unsupported" and never touches the camera when the API is missing', async () => {
    setMediaDevices(undefined);
    const onError = vi.fn();
    render(<BarcodeScanner onDetect={vi.fn()} onError={onError} />);

    await waitFor(() => expect(onError).toHaveBeenCalledWith('unsupported'));
  });

  it('reports "denied" when getUserMedia is refused', async () => {
    const getUserMedia = vi.fn().mockRejectedValue(new DOMException('no', 'NotAllowedError'));
    setMediaDevices({ getUserMedia });
    const onError = vi.fn();
    render(<BarcodeScanner onDetect={vi.fn()} onError={onError} />);

    await waitFor(() => expect(onError).toHaveBeenCalledWith('denied'));
  });

  it('decodes with the native BarcodeDetector when the browser has one', async () => {
    const getUserMedia = vi.fn().mockResolvedValue(fakeStream());
    setMediaDevices({ getUserMedia });
    const detect = vi.fn().mockResolvedValue([{ rawValue: '5601234567890' }]);
    (window as unknown as { BarcodeDetector: unknown }).BarcodeDetector = vi
      .fn()
      .mockImplementation(() => ({ detect }));

    const onDetect = vi.fn();
    render(<BarcodeScanner onDetect={onDetect} onError={vi.fn()} />);

    await waitFor(() => expect(onDetect).toHaveBeenCalledWith('5601234567890'));
  });

  it('folds repeated frames of the same code into a single detection', async () => {
    const getUserMedia = vi.fn().mockResolvedValue(fakeStream());
    setMediaDevices({ getUserMedia });
    const detect = vi.fn().mockResolvedValue([{ rawValue: 'ABC' }]);
    (window as unknown as { BarcodeDetector: unknown }).BarcodeDetector = vi
      .fn()
      .mockImplementation(() => ({ detect }));

    const onDetect = vi.fn();
    render(<BarcodeScanner onDetect={onDetect} onError={vi.fn()} />);

    // A handful of frames all reading the same box, not a handful of taps.
    await waitFor(() => expect(detect.mock.calls.length).toBeGreaterThan(3));
    expect(onDetect).toHaveBeenCalledTimes(1);
  });

  it('falls back to the @zxing/browser decoder when BarcodeDetector is absent', async () => {
    const getUserMedia = vi.fn().mockResolvedValue(fakeStream());
    setMediaDevices({ getUserMedia });

    const onDetect = vi.fn();
    render(<BarcodeScanner onDetect={onDetect} onError={vi.fn()} />);

    await waitFor(() => expect(onDetect).toHaveBeenCalledWith('ZXING-CODE'));
  });

  it('stops the camera stream on unmount', async () => {
    const stop = vi.fn();
    const getUserMedia = vi.fn().mockResolvedValue({ getTracks: () => [{ stop }] });
    setMediaDevices({ getUserMedia });
    const detect = vi.fn().mockResolvedValue([]);
    (window as unknown as { BarcodeDetector: unknown }).BarcodeDetector = vi
      .fn()
      .mockImplementation(() => ({ detect }));

    const { unmount } = render(<BarcodeScanner onDetect={vi.fn()} onError={vi.fn()} />);
    await waitFor(() => expect(getUserMedia).toHaveBeenCalled());
    unmount();

    await waitFor(() => expect(stop).toHaveBeenCalled());
  });
});
