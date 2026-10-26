import { Plus, MessageSquare, Trash2, X, Clock, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

/**
 * ChatSidebar component for desktop sidebar and mobile slide-in drawer
 */
export function ChatSidebar({
  isOpen,
  onClose,
  conversations = [],
  activeConversationId,
  onSelectConversation,
  onNewChat,
  onDeleteConversation,
  onClearAll,
}) {
  return (
    <>
      {/* Mobile Backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="sidebar-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden="true"
          />
        )}
      </AnimatePresence>

      {/* Sidebar / Drawer Panel */}
      <aside
        className={`chat-sidebar ${isOpen ? 'sidebar-open' : 'sidebar-closed'}`}
        aria-label="Conversation History"
      >
        <div className="sidebar-inner">
          {/* Header */}
          <div className="sidebar-header">
            <div className="sidebar-title-group">
              <Clock size={16} className="sidebar-title-icon" aria-hidden="true" />
              <h3 className="sidebar-heading">Past Inquiries</h3>
            </div>
            <button
              type="button"
              className="sidebar-close-btn"
              onClick={onClose}
              aria-label="Close conversation drawer"
            >
              <X size={18} />
            </button>
          </div>

          {/* New Chat Button */}
          <div className="sidebar-action-container">
            <button
              type="button"
              className="sidebar-new-chat-btn"
              onClick={() => {
                onNewChat();
                if (window.innerWidth < 768) onClose();
              }}
            >
              <Plus size={16} aria-hidden="true" />
              <span>New Conversation</span>
            </button>
          </div>

          {/* Conversation List */}
          <div className="sidebar-list-container">
            {conversations.length === 0 ? (
              <div className="sidebar-empty-state">
                <div className="empty-icon-circle">
                  <Sparkles size={20} aria-hidden="true" />
                </div>
                <p className="empty-title">No inquiries yet</p>
                <p className="empty-desc">
                  Your questions and retrieved campus insights will be saved here.
                </p>
              </div>
            ) : (
              <ul className="sidebar-chat-list">
                {conversations.map((item) => {
                  const isActive = item.id === activeConversationId;
                  const messageCount = item.messages ? item.messages.length : 0;
                  const dateStr = item.updatedAt
                    ? new Date(item.updatedAt).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                      })
                    : '';

                  return (
                    <li key={item.id} className="sidebar-list-item">
                      <div
                        className={`sidebar-conv-card ${isActive ? 'active' : ''}`}
                        role="button"
                        tabIndex={0}
                        onClick={() => {
                          onSelectConversation(item.id);
                          if (window.innerWidth < 768) onClose();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onSelectConversation(item.id);
                            if (window.innerWidth < 768) onClose();
                          }
                        }}
                      >
                        <div className="conv-card-icon">
                          <MessageSquare size={15} aria-hidden="true" />
                        </div>

                        <div className="conv-card-info">
                          <span className="conv-card-title" title={item.title}>
                            {item.title}
                          </span>
                          <span className="conv-card-meta">
                            {dateStr} • {messageCount} msg{messageCount === 1 ? '' : 's'}
                          </span>
                        </div>

                        <button
                          type="button"
                          className="conv-delete-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteConversation(item.id);
                          }}
                          aria-label={`Delete conversation ${item.title}`}
                          title="Delete inquiry"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Sidebar Footer */}
          {conversations.length > 0 && (
            <div className="sidebar-footer">
              <button
                type="button"
                className="clear-all-btn"
                onClick={onClearAll}
                title="Clear all stored inquiries"
              >
                <Trash2 size={13} aria-hidden="true" />
                <span>Clear All History</span>
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

export default ChatSidebar;
