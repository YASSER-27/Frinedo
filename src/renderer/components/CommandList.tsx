import { BotCommand } from '@shared/types';

interface Props {
  commands: BotCommand[];
  onRemove: (id: string) => void;
}

export default function CommandList({ commands, onRemove }: Props) {
  if (commands.length === 0) {
    return <div className="empty-state">No commands configured</div>;
  }

  return (
    <div>
      {commands.map((cmd) => (
        <div className="command-item" key={cmd.id}>
          <div className="command-item-header">
            <div>
              <span className="command-item-title">{cmd.actionType}</span>
              {cmd.isBuiltIn && (
                <span className="built-in-badge" style={{ marginLeft: 8 }}>
                  Built-in
                </span>
              )}
            </div>
            {!cmd.isBuiltIn && (
              <button
                className="btn btn-danger btn-sm"
                onClick={() => onRemove(cmd.id)}
              >
                Remove
              </button>
            )}
          </div>
          <div className="command-item-meta">Response: "{cmd.responseText}"</div>
          {cmd.actionParams && Object.keys(cmd.actionParams).length > 0 && (
            <div className="command-item-meta">
              Params:{' '}
              {Object.entries(cmd.actionParams)
                .map(([k, v]) => `${k}=${v}`)
                .join(', ')}
            </div>
          )}
          <div className="command-phrases">
            {cmd.triggerPhrases.map((phrase) => (
              <span className="phrase-tag" key={phrase}>
                {phrase}
              </span>
            ))}
          </div>
          {cmd.voiceResponsePath && (
            <div className="command-item-meta" style={{ marginTop: 6 }}>
              Voice: attached
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
