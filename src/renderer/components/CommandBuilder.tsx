import { useState, useEffect, useRef } from 'react';
import { ActionDefinition, ActionType, BotCommand } from '@shared/types';
import VoiceRecorder from './VoiceRecorder';

interface Props {
  onCommandAdded: () => void;
}

export default function CommandBuilder({ onCommandAdded }: Props) {
  const [actions, setActions] = useState<ActionDefinition[]>([]);
  const [triggerPhrase, setTriggerPhrase] = useState('');
  const [actionQuery, setActionQuery] = useState('');
  const [selectedAction, setSelectedAction] = useState<ActionDefinition | null>(null);
  const [params, setParams] = useState<Record<string, string | number>>({});
  const [responseText, setResponseText] = useState('');
  const [voicePath, setVoicePath] = useState<string | undefined>();
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const autocompleteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.electronAPI.actions.list().then(setActions);
  }, []);

  // Simple substring filter — no AI
  const filteredActions = actions.filter((action) => {
    if (!actionQuery.trim()) return true;
    const q = actionQuery.toLowerCase();
    return (
      action.name.toLowerCase().includes(q) ||
      action.label.toLowerCase().includes(q) ||
      action.description.toLowerCase().includes(q)
    );
  });

  const selectAction = (action: ActionDefinition) => {
    setSelectedAction(action);
    setActionQuery(action.name);
    setShowAutocomplete(false);

    const defaults: Record<string, string | number> = {};
    for (const param of action.params) {
      if (param.default !== undefined) {
        defaults[param.key] = param.default;
      } else {
        defaults[param.key] = param.type === 'number' ? 0 : '';
      }
    }
    setParams(defaults);
  };

  const handleActionKeyDown = (e: React.KeyboardEvent) => {
    if (!showAutocomplete || filteredActions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filteredActions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      selectAction(filteredActions[selectedIndex]);
    } else if (e.key === 'Escape') {
      setShowAutocomplete(false);
    }
  };

  const handleAdd = async () => {
    if (!triggerPhrase.trim() || !selectedAction || !responseText.trim()) return;

    const command: BotCommand = {
      id: `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      triggerPhrases: triggerPhrase.split(',').map((p) => p.trim()).filter(Boolean),
      actionType: selectedAction.name as ActionType,
      actionParams: Object.keys(params).length > 0 ? params : undefined,
      responseText: responseText.trim(),
      voiceResponsePath: voicePath,
    };

    await window.electronAPI.commands.add(command);
    onCommandAdded();

    setTriggerPhrase('');
    setActionQuery('');
    setSelectedAction(null);
    setParams({});
    setResponseText('');
    setVoicePath(undefined);
  };

  return (
    <div>
      <div className="form-group">
        <label>Trigger Phrase(s)</label>
        <input
          type="text"
          value={triggerPhrase}
          onChange={(e) => setTriggerPhrase(e.target.value)}
          placeholder="stop, halt (comma-separated)"
        />
      </div>

      <div className="form-group autocomplete-wrapper" ref={autocompleteRef}>
        <label>Action</label>
        <input
          type="text"
          value={actionQuery}
          onChange={(e) => {
            setActionQuery(e.target.value);
            setShowAutocomplete(true);
            setSelectedIndex(0);
            setSelectedAction(null);
          }}
          onFocus={() => setShowAutocomplete(true)}
          onBlur={() => setTimeout(() => setShowAutocomplete(false), 150)}
          onKeyDown={handleActionKeyDown}
          placeholder="Type to search actions..."
        />
        {showAutocomplete && filteredActions.length > 0 && (
          <div className="autocomplete-list">
            {filteredActions.map((action, index) => (
              <div
                key={action.name}
                className={`autocomplete-item ${index === selectedIndex ? 'selected' : ''}`}
                onMouseDown={() => selectAction(action)}
              >
                <div className="autocomplete-item-name">{action.name}</div>
                <div className="autocomplete-item-desc">{action.description}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {selectedAction && selectedAction.params.length > 0 && (
        <>
          <hr className="section-divider" />
          {selectedAction.params.map((param) => (
            <div className="form-group" key={param.key}>
              <label>
                {param.label}
                {param.required && ' *'}
              </label>
              <input
                type={param.type === 'number' ? 'number' : 'text'}
                value={params[param.key] ?? ''}
                onChange={(e) =>
                  setParams((prev) => ({
                    ...prev,
                    [param.key]:
                      param.type === 'number' ? Number(e.target.value) : e.target.value,
                  }))
                }
                placeholder={String(param.default ?? '')}
              />
            </div>
          ))}
        </>
      )}

      <div className="form-group">
        <label>Bot Response Text</label>
        <textarea
          rows={2}
          value={responseText}
          onChange={(e) => setResponseText(e.target.value)}
          placeholder="Text the bot says in chat"
        />
      </div>

      <div className="form-group">
        <label>Voice Response</label>
        <VoiceRecorder
          responseText={responseText}
          onVoiceGenerated={setVoicePath}
        />
        {voicePath && (
          <div className="voice-status success" style={{ marginTop: 4 }}>
            Voice attached
          </div>
        )}
      </div>

      <button
        className="btn btn-primary"
        onClick={handleAdd}
        disabled={!triggerPhrase.trim() || !selectedAction || !responseText.trim()}
      >
        Add Command
      </button>
    </div>
  );
}
