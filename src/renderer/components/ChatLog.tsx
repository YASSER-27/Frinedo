import { useEffect, useRef } from 'react';
import { ChatMessage } from '@shared/types';

interface Props {
  messages: ChatMessage[];
}

export default function ChatLog({ messages }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="empty-state">
        Chat log will appear here once connected
      </div>
    );
  }

  const formatTime = (ts: number) => {
    return new Date(ts).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  return (
    <div className="chat-log">
      {messages.map((msg) => {
        const className = msg.isBot
          ? 'chat-message chat-message-bot'
          : msg.sender === 'System'
          ? 'chat-message chat-message-system'
          : 'chat-message chat-message-user';

        return (
          <div className={className} key={msg.id}>
            <span className="chat-sender">{msg.sender}:</span>
            {msg.text}
            <span className="chat-time">{formatTime(msg.timestamp)}</span>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
