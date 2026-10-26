import { Plus, PanelLeft } from 'lucide-react';
import { motion } from 'motion/react';
import ThemeToggle from './ThemeToggle';

/**
 * ChatHeader component featuring actual WCE branding, real status indicator,
 * new chat action, history sidebar toggle, and theme switch.
 */
export function ChatHeader({
  theme,
  onToggleTheme,
  onNewChat,
  onToggleSidebar,
  status = 'ready', // 'ready' | 'loading' | 'offline'
  isSidebarOpen = false,
}) {
  // Status label & color mapping
  const getStatusDetails = () => {
    switch (status) {
      case 'loading':
        return { label: 'Thinking...', className: 'status-busy', title: 'Processing your inquiry' };
      case 'offline':
        return { label: 'Backend Disconnected', className: 'status-offline', title: 'Backend service unreachable' };
      case 'ready':
      default:
        return { label: 'Ready', className: 'status-online', title: 'RAG Campus Assistant active' };
    }
  };

  const statusInfo = getStatusDetails();

  return (
    <header className="chat-header">
      <div className="header-left">
        {/* Sidebar history drawer toggle */}
        <motion.button
          type="button"
          className={`header-icon-btn sidebar-toggle-btn ${isSidebarOpen ? 'active' : ''}`}
          onClick={onToggleSidebar}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          aria-label={isSidebarOpen ? 'Close chat history' : 'Open chat history'}
          title="Conversation history"
        >
          <PanelLeft size={19} aria-hidden="true" />
        </motion.button>

        {/* WCE Logo & Branding */}
        <div className="header-brand">
          <div className="logo-container">
            <img
              src="/wce-logo.png"
              alt="WCE Sangli Crest"
              className="wce-logo-img"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          </div>

          <div className="brand-text">
            <div className="brand-title-row">
              <h1 className="brand-title">WCE Campus Assistant</h1>
              <span className="brand-badge">RAG AI</span>
            </div>
            <div className="brand-subtitle-row">
              <span className="brand-subtitle">Walchand College of Engineering</span>
              <span className="status-divider">•</span>
              <div className="status-pill" title={statusInfo.title}>
                <span className={`status-dot ${statusInfo.className}`} />
                <span className="status-text">{statusInfo.label}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="header-right">
        {/* New Chat Action */}
        <motion.button
          type="button"
          className="header-action-btn new-chat-btn"
          onClick={onNewChat}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.96 }}
          aria-label="Start new conversation"
          title="Start a new conversation"
        >
          <Plus size={16} aria-hidden="true" />
          <span className="new-chat-text">New Chat</span>
        </motion.button>

        {/* Theme Toggle */}
        <ThemeToggle theme={theme} onToggle={onToggleTheme} />
      </div>
    </header>
  );
}

export default ChatHeader;
