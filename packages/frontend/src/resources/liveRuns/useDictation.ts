import { useCallback, useEffect, useRef, useState } from 'react';
import { DictationHandle, isDictationAvailable, startDictation } from './speech';

export interface DictationTarget {
  /** What is in the field now, so speech is appended rather than replacing it. */
  current: string;
  onChange: (text: string) => void;
}

export interface DictationControl {
  /** False where the browser has no Web Speech at all. The button is then absent. */
  available: boolean;
  listening: boolean;
  /** Which field is being dictated into, so only that mic shows as active. */
  activeField: string | null;
  start: (field: string, target: DictationTarget) => void;
  stop: () => void;
  error: string | null;
}

/**
 * Dictation into whichever field asked for it.
 *
 * One controller for the whole screen rather than one per field: a browser will
 * only run one recogniser at a time, and five independent hooks would race for
 * the microphone and leave two mic buttons lit.
 *
 * Speech is **appended** to what is already in the field. A crew dictating a
 * second sentence must not wipe the first, and a recogniser that starts with an
 * empty transcript would do exactly that.
 */
export function useDictation(): DictationControl {
  const [listening, setListening] = useState(false);
  const [activeField, setActiveField] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handle = useRef<DictationHandle | null>(null);
  // The text the field had when dictation started, so an interim result replaces
  // only the part being spoken rather than the sentence before it.
  const base = useRef('');

  const stop = useCallback(() => {
    handle.current?.stop();
    handle.current = null;
    setListening(false);
    setActiveField(null);
  }, []);

  /** Nothing is left listening when the screen goes away. */
  useEffect(() => () => handle.current?.stop(), []);

  const start = useCallback(
    (field: string, target: DictationTarget) => {
      if (listening) {
        stop();
        return;
      }
      setError(null);
      base.current = target.current.trim();

      const started = startDictation({
        onTranscript: (text, isFinal) => {
          const joined = base.current ? `${base.current} ${text}` : text;
          target.onChange(joined);
          if (isFinal) base.current = joined.trim();
        },
        onError: (cause) => {
          // `no-speech` and `aborted` are not failures worth a message: the crew
          // tapped the mic and said nothing, or tapped it again.
          if (cause !== 'no-speech' && cause !== 'aborted') setError(cause);
          stop();
        },
        onEnd: () => stop(),
      });

      if (!started) {
        setError('unavailable');
        return;
      }
      handle.current = started;
      setListening(true);
      setActiveField(field);
    },
    [listening, stop],
  );

  return {
    available: isDictationAvailable(),
    listening,
    activeField,
    start,
    stop,
    error,
  };
}
