import { useEffect, useState } from 'react';
import { BotConnectionStatus, ChatMessage, TestMatchResult } from '@shared/types';
import { getApi } from '../api';

interface Props {
  status: BotConnectionStatus;
  messages: ChatMessage[];
  onStatusChange: (status: BotConnectionStatus) => void;
}

export default function TestGameModal({ status, messages, onStatusChange }: Props) {
  const [phrase, setPhrase] = useState('create a furnace');
  const [result, setResult] = useState<TestMatchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const test = async () => {
    setResult(await getApi().bot.testMatch(phrase));
  };

  useEffect(() => {
    void test();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async () => {
    setBusy(true);
    setError('');
    try {
      const settings = await getApi().settings.get();
      onStatusChange(await getApi().bot.connect(settings));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      onStatusChange('error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel-view">
      <h2>Test game</h2>
      <p className="hint">Status: {status}. Type a chat line to see which action it maps to.</p>
      <div className="field">
        <label>Chat line</label>
        <input value={phrase} onChange={(e) => setPhrase(e.target.value)} />
      </div>
      <div className="mapped">
        <span>Match</span>
        <strong>{result?.matched ? result.label : 'No match'}</strong>
      </div>
      {result?.startText && <p className="hint">Start: {result.startText}</p>}
      {result?.doneText && <p className="hint">Done: {result.doneText}</p>}
      {error && <div className="voice-bad">{error}</div>}

      <div className="actions">
        <button className="btn" onClick={() => void test()}>Test phrase</button>
        {status === 'connected' ? (
          <button className="btn" disabled>Connected</button>
        ) : (
          <button className="btn primary" onClick={() => void connect()} disabled={busy}>
            {busy ? 'Connecting...' : 'Connect'}
          </button>
        )}
      </div>
    </div>
  );
}
