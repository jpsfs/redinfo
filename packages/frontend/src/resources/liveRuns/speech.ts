/**
 * Dictation, feature-detected.
 *
 * The Web Speech API is Chrome-only and prefixed, so every entry point here is
 * guarded and the whole module degrades to "not available" — the keyboard is
 * always the fallback and is never taken away. A crew whose phone cannot dictate
 * must not see a button that does nothing.
 *
 * `pt-PT` explicitly, and not the browser's locale: an Android phone set to
 * en-GB in a Portuguese ambulance would otherwise transcribe "dispneia" as
 * "displeasure".
 */

export const SPEECH_LANGUAGE = 'pt-PT';

/** Just enough of the two prefixed shapes to use one. */
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<{ 0: { transcript: string }; isFinal: boolean }>;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

function constructor(): SpeechRecognitionConstructor | null {
  const globals = globalThis as unknown as {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  };
  return globals.SpeechRecognition ?? globals.webkitSpeechRecognition ?? null;
}

export function isDictationAvailable(): boolean {
  return constructor() !== null;
}

export interface DictationHandle {
  stop: () => void;
}

export interface DictationCallbacks {
  /** Fired for every result, final or not, so the field fills in as they speak. */
  onTranscript: (text: string, isFinal: boolean) => void;
  onError?: (error: string) => void;
  onEnd?: () => void;
}

/**
 * Starts dictating, or returns null where it is not available.
 *
 * `interimResults` on, because the crew has to see that it is listening —
 * silence from a microphone button is indistinguishable from a broken one.
 */
export function startDictation(callbacks: DictationCallbacks): DictationHandle | null {
  const Recognition = constructor();
  if (!Recognition) return null;

  try {
    const recognition = new Recognition();
    recognition.lang = SPEECH_LANGUAGE;
    // Not continuous: a field is one utterance, and a recogniser left running
    // picks up the patient, the radio and the road.
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        callbacks.onTranscript(result[0].transcript, result.isFinal);
      }
    };
    recognition.onerror = (event) => callbacks.onError?.(event.error ?? 'speech-error');
    recognition.onend = () => callbacks.onEnd?.();

    recognition.start();
    return { stop: () => recognition.stop() };
  } catch (cause) {
    callbacks.onError?.(cause instanceof Error ? cause.message : 'speech-error');
    return null;
  }
}
