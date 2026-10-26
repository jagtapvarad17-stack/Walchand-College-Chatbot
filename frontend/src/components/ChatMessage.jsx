import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Copy, Check, User, Bot, AlertCircle, RefreshCw, Library } from 'lucide-react';
import { motion } from 'motion/react';
import SourceCard from './SourceCard';

/**
 * Custom CodeBlock component for markdown code blocks with copy-to-clipboard functionality
 */
function CodeBlock({ children, className }) {
  const [copied, setCopied] = useState(false);
  const match = /language-(\w+)/.exec(className || '');
  const language = match ? match[1] : '';
  const codeText = String(children).replace(/\n$/, '');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <div className="code-block-wrapper">
      <div className="code-block-header">
        <span>{language || 'text'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="code-copy-btn"
          aria-label={copied ? 'Code copied to clipboard' : 'Copy code to clipboard'}
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          <span>{copied ? 'Copied' : 'Copy code'}</span>
        </button>
      </div>
      <pre>
        <code>{children}</code>
      </pre>
    </div>
  );
}

/**
 * Message component representing either a User prompt or Assistant RAG answer
 */
export function ChatMessage({ message, onRetry }) {
  const [hasCopiedAnswer, setHasCopiedAnswer] = useState(false);
  const isUser = message.role === 'user';
  const isError = Boolean(message.error);
  const hasSources = Array.isArray(message.sources) && message.sources.length > 0;

  const handleCopyAnswer = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setHasCopiedAnswer(true);
      setTimeout(() => setHasCopiedAnswer(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <motion.div
      className={`chat-message-row ${isUser ? 'user-row' : 'bot-row'} ${isError ? 'error-row' : ''}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: 'easeOut' }}
    >
      <div className="message-wrapper">
        {/* Avatar */}
        <div className={`message-avatar ${isUser ? 'user-avatar' : 'bot-avatar'}`} aria-hidden="true">
          {isUser ? (
            <User size={18} />
          ) : (
            <img
              src="/wce-logo.png"
              alt="WCE"
              className="bot-avatar-img"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          )}
          {!isUser && <Bot size={18} className="bot-avatar-fallback" />}
        </div>

        {/* Message Content Container */}
        <div className="message-body-container">
          <div className="message-header-meta">
            <span className="sender-name">
              {isUser ? 'You' : 'WCE Campus Assistant'}
            </span>
            {message.timestamp && (
              <span className="message-time">
                {new Date(message.timestamp).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
          </div>

          {/* Bubble */}
          <div className={`message-bubble ${isUser ? 'user-bubble' : 'bot-bubble'}`}>
            {isError ? (
              <div className="message-error-box">
                <div className="error-content">
                  <AlertCircle size={18} className="error-icon" aria-hidden="true" />
                  <p className="error-text">{message.content}</p>
                </div>
                {onRetry && (
                  <button
                    type="button"
                    className="retry-btn"
                    onClick={() => onRetry(message)}
                  >
                    <RefreshCw size={13} aria-hidden="true" />
                    <span>Retry Request</span>
                  </button>
                )}
              </div>
            ) : isUser ? (
              <p className="user-text-content">{message.content}</p>
            ) : (
              <div className="markdown-body">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    // ── Code blocks ──────────────────────────────────────────
                    // react-markdown v10: inline code has no `node.children[0].value` newlines
                    code({ node, inline, className, children, ...props }) {
                      // Treat as block if it has a language class OR spans multiple lines
                      const isBlock =
                        !inline &&
                        (className?.startsWith('language-') ||
                          String(children).includes('\n'));
                      if (isBlock) {
                        return (
                          <CodeBlock className={className} {...props}>
                            {children}
                          </CodeBlock>
                        );
                      }
                      return (
                        <code className={className} {...props}>
                          {children}
                        </code>
                      );
                    },

                    // ── Links ────────────────────────────────────────────────
                    a({ href, children, ...props }) {
                      return (
                        <a
                          href={href}
                          target="_blank"
                          rel="noopener noreferrer"
                          {...props}
                        >
                          {children}
                        </a>
                      );
                    },

                    // ── Tables ───────────────────────────────────────────────
                    // Wrap the <table> in a scrollable container so wide tables
                    // don't overflow the chat bubble on small viewports.
                    table({ children, ...props }) {
                      return (
                        <div className="markdown-table-wrapper" role="region" aria-label="Data table">
                          <table {...props}>{children}</table>
                        </div>
                      );
                    },
                    thead({ children, ...props }) {
                      return <thead {...props}>{children}</thead>;
                    },
                    tbody({ children, ...props }) {
                      return <tbody {...props}>{children}</tbody>;
                    },
                    tr({ children, ...props }) {
                      return <tr {...props}>{children}</tr>;
                    },
                    th({ children, ...props }) {
                      return <th {...props}>{children}</th>;
                    },
                    td({ children, ...props }) {
                      return <td {...props}>{children}</td>;
                    },
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              </div>
            )}
          </div>

          {/* Assistant Action Bar (Copy Answer) */}
          {!isUser && !isError && (
            <div className="bot-message-actions">
              <button
                type="button"
                className="copy-message-btn"
                onClick={handleCopyAnswer}
                aria-label={hasCopiedAnswer ? 'Answer copied' : 'Copy answer to clipboard'}
                title="Copy answer"
              >
                {hasCopiedAnswer ? (
                  <>
                    <Check size={13} className="copy-check" aria-hidden="true" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy size={13} aria-hidden="true" />
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* RAG Retrieved Sources Section */}
          {!isUser && hasSources && (
            <div className="sources-container">
              <div className="sources-header">
                <Library size={14} className="sources-header-icon" aria-hidden="true" />
                <span className="sources-header-title">
                  Referenced Campus Sources ({message.sources.length})
                </span>
              </div>
              <div className="sources-grid">
                {message.sources.map((src, idx) => (
                  <SourceCard key={src.id || idx} source={src} index={idx} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default ChatMessage;
