import React, { useState, useRef, useEffect } from 'react';
import { DCChatMessage, Role } from '../types/protocol';
import { Send, MessageSquare, Shield, Smile } from 'lucide-react';

interface ChatPanelProps {
  messages: DCChatMessage[];
  currentRole: Role | null;
  dataChannelState: RTCDataChannelState;
  onSendMessage: (text: string) => boolean;
}

const QUICK_REACTIONS = ['🍿', '🎬', '❤️', '🔥', '😮', '😂', '👏', '🥤'];

export const ChatPanel: React.FC<ChatPanelProps> = ({
  messages,
  currentRole,
  dataChannelState,
  onSendMessage,
}) => {
  const [inputText, setInputText] = useState('');
  const [lastSentTime, setLastSentTime] = useState(0);
  const [rateWarning, setRateWarning] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  const isConnected = dataChannelState === 'open';

  // Auto scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = inputText.trim();
    if (!text) return;

    if (text.length > 500) {
      setRateWarning('Message exceeds 500 character limit');
      return;
    }

    const now = Date.now();
    // Rate limit: 1 message every 300ms
    if (now - lastSentTime < 300) {
      setRateWarning('Sending too fast. Please wait a moment.');
      return;
    }

    setRateWarning(null);
    const success = onSendMessage(text);
    if (success) {
      setInputText('');
      setLastSentTime(now);
    }
  };

  const handleQuickReaction = (emoji: string) => {
    if (!isConnected) return;
    onSendMessage(emoji);
  };

  return (
    <div className="flex flex-col h-full bg-[#0d0d0d] border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
      {/* Header */}
      <div className="px-4 py-3 bg-[#141414] border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-orange-400" />
          <h3 className="text-sm font-semibold text-slate-100">Live P2P Chat</h3>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
          <Shield className="w-3 h-3 text-emerald-400" />
          <span className="font-mono">Direct DataChannel</span>
        </div>
      </div>

      {/* Messages List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-[220px]">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500 space-y-2">
            <Smile className="w-8 h-8 text-slate-600 stroke-[1.5]" />
            <p className="text-xs text-slate-400">No messages yet.</p>
            <p className="text-[11px] text-slate-500">
              Messages flow directly peer-to-peer and are never saved on any server.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
            const isMe = msg.sender === currentRole;
            const timeStr = new Date(msg.sentAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} space-y-1`}
              >
                <div className="flex items-center gap-1.5 text-[10px] text-slate-500 font-mono">
                  <span className="font-semibold text-slate-400">
                    {isMe ? 'You' : msg.sender === 'host' ? 'Host' : 'Viewer'}
                  </span>
                  <span>•</span>
                  <span>{timeStr}</span>
                </div>
                <div
                  className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed break-words shadow-sm ${
                    isMe
                      ? 'bg-gradient-to-r from-orange-500 to-amber-500 text-white rounded-br-none shadow-md shadow-orange-950/30'
                      : 'bg-[#181818] text-slate-100 border border-white/10 rounded-bl-none'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Quick Reactions Bar */}
      <div className="px-3 py-1.5 bg-[#121212] border-t border-white/10 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        {QUICK_REACTIONS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            disabled={!isConnected}
            onClick={() => handleQuickReaction(emoji)}
            className="px-2 py-1 hover:bg-white/10 rounded-lg text-base transition-transform active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {emoji}
          </button>
        ))}
      </div>

      {/* Input Box */}
      <form onSubmit={handleSend} className="p-3 bg-[#141414] border-t border-white/10 space-y-2">
        {rateWarning && (
          <div className="text-[11px] text-amber-400 bg-amber-950/50 px-2.5 py-1 rounded-lg border border-amber-800/50">
            {rateWarning}
          </div>
        )}
        <div className="flex items-center gap-2">
          <input
            id="chat-input"
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={!isConnected}
            placeholder={
              isConnected ? 'Send private P2P message...' : 'Connecting DataChannel...'
            }
            maxLength={500}
            className="flex-1 bg-[#080808] border border-white/10 rounded-xl px-3.5 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500 disabled:opacity-50 transition-all"
          />
          <button
            id="chat-send-btn"
            type="submit"
            disabled={!isConnected || !inputText.trim()}
            className="p-2.5 bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-400 hover:to-amber-400 disabled:bg-white/5 disabled:text-slate-600 text-white rounded-xl transition-all shadow-md shadow-orange-950/30 active:scale-95 disabled:cursor-not-allowed cursor-pointer"
            title="Send Message"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <div className="flex justify-between items-center px-1 text-[10px] text-slate-500 font-mono">
          <span>{isConnected ? '● Connected' : '○ Offline'}</span>
          <span>{inputText.length}/500</span>
        </div>
      </form>
    </div>
  );
};
