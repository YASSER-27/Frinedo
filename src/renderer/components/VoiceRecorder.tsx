import { useRef, useEffect, useState } from 'react';

interface Props {
  responseText: string;
  onVoiceGenerated: (path: string) => void;
}

export default function VoiceRecorder({ responseText, onVoiceGenerated }: Props) {
  const [generating, setGenerating] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [recording, setRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  const generateWithSupertonic = async () => {
    if (!responseText.trim()) {
      setStatus({ type: 'error', message: 'Enter response text first' });
      return;
    }

    setGenerating(true);
    setStatus(null);

    try {
      const result = await window.electronAPI.tts.generate({ text: responseText });
      if (result.success && result.outputPath) {
        setStatus({ type: 'success', message: 'Voice generated!' });
        onVoiceGenerated(result.outputPath);
        playAudio(result.outputPath);
      } else {
        setStatus({ type: 'error', message: result.error ?? 'Generation failed' });
      }
    } catch (err) {
      setStatus({
        type: 'error',
        message: err instanceof Error ? err.message : 'TTS error',
      });
    } finally {
      setGenerating(false);
    }
  };

  const playAudio = (src: string) => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    const audio = new Audio(`file://${src.replace(/\\/g, '/')}`);
    audioRef.current = audio;
    void audio.play().catch(() => {
      // file:// may be blocked in dev — user can preview after save
    });
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        setStatus({ type: 'success', message: 'Recording saved (preview only — use Supertonic for WAV)' });
        onVoiceGenerated(url);
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
      setStatus(null);
    } catch {
      setStatus({ type: 'error', message: 'Microphone access denied' });
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  };

  const cancelGeneration = async () => {
    await window.electronAPI.tts.cancel();
    setGenerating(false);
    setStatus({ type: 'error', message: 'Voice generation cancelled' });
  };

  return (
    <div>
      <div className="btn-row">
        <button
          className="btn btn-secondary btn-sm"
          onClick={generateWithSupertonic}
          disabled={generating || !responseText.trim()}
        >
          {generating ? 'Generating...' : 'Generate (Supertonic)'}
        </button>
        {!recording ? (
          <button className="btn btn-secondary btn-sm" onClick={startRecording}>
            Record
          </button>
        ) : (
          <button className="btn btn-danger btn-sm" onClick={stopRecording}>
            Stop Recording
          </button>
        )}
      </div>
      {generating && (
        <div className="voice-loading" role="status">
          <span />Generating voice...
          <button className="btn loading-cancel" onClick={() => void cancelGeneration()}>Cancel</button>
        </div>
      )}
      {status && (
        <div className={`voice-status ${status.type}`}>{status.message}</div>
      )}
    </div>
  );
}
