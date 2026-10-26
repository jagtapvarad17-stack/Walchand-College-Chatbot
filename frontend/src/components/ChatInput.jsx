import { useRef, useEffect } from 'react';
import { Send, CornerDownLeft, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';

/**
 * Message composer with auto-growing textarea, keyboard navigation,
 * and loading/disabled state handling.
 */
export function ChatInput({
  input,
  setInput,
  onSend,
  isLoading,
  disabled = false,
  placeholder = 'Ask a question about WCE courses, admissions, facilities...',
}) {
  const textareaRef = useRef(null);

  // Auto-resize textarea height to match content
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const newHeight = Math.min(el.scrollHeight, 160);
    el.style.height = `${Math.max(newHeight, 44)}px`;
  }, [input]);

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (isLoading || disabled) return;
    if (!input || !input.trim()) return;
    onSend(input.trim());
  };

  const handleKeyDown = (e) => {
    // Send on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const canSubmit = Boolean(input && input.trim()) && !isLoading && !disabled;

  return (
    <form className="chat-composer-form" onSubmit={handleSubmit}>
      <div className="composer-container">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || isLoading}
          rows={1}
          className="composer-textarea"
          aria-label="Ask WCE Campus Assistant"
        />

        <div className="composer-footer-row">
          <div className="composer-hints">
            <span className="key-hint">
              <CornerDownLeft size={11} aria-hidden="true" />
              <span>Enter to send</span>
            </span>
            <span className="hint-divider">•</span>
            <span className="key-hint">Shift + Enter for new line</span>
          </div>

          <motion.button
            type="submit"
            disabled={!canSubmit}
            className={`composer-send-btn ${canSubmit ? 'can-send' : ''}`}
            whileHover={canSubmit ? { scale: 1.05 } : {}}
            whileTap={canSubmit ? { scale: 0.95 } : {}}
            aria-label={isLoading ? 'Sending inquiry...' : 'Send inquiry'}
            title="Send inquiry"
          >
            {isLoading ? (
              <Loader2 size={17} className="btn-spinner" aria-hidden="true" />
            ) : (
              <Send size={16} aria-hidden="true" />
            )}
          </motion.button>
        </div>
      </div>
    </form>
  );
}

export default ChatInput;
