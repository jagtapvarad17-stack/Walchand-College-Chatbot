import { useState, useEffect, useRef, useCallback } from 'react';
import { MotionConfig, AnimatePresence, motion } from 'motion/react';
import { ArrowDown, AlertTriangle } from 'lucide-react';

import { useTheme } from './hooks/useTheme';
import { sendChatMessage, checkBackendHealth } from './services/api';
import {
  getSavedConversations,
  saveConversation,
  deleteConversation,
  clearAllConversations,
  generateConversationTitle,
} from './services/storage';

import ChatHeader from './components/ChatHeader';
import WelcomeScreen from './components/WelcomeScreen';
import ChatMessage from './components/ChatMessage';
import TypingIndicator from './components/TypingIndicator';
import ChatInput from './components/ChatInput';
import ChatSidebar from './components/ChatSidebar';

import './styles/theme.css';
import './styles/markdown.css';
import './App.css';

// Helper to generate IDs outside render flow
function createId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function createTimestamp() {
  return new Date().toISOString();
}

function App() {
  const { theme, toggleTheme } = useTheme();

  // Conversation state initialized from local storage
  const [conversations, setConversations] = useState(() => getSavedConversations());
  const [activeConversationId, setActiveConversationId] = useState(() => createId('conv'));
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');

  // UI state
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState('ready'); // 'ready' | 'loading' | 'offline'
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Health check on mount
  useEffect(() => {
    let mounted = true;
    checkBackendHealth().then((isHealthy) => {
      if (mounted) {
        setStatus(isHealthy ? 'ready' : 'offline');
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Sync conversation update to persistence and list
  const syncConversation = useCallback((convId, msgs) => {
    if (!msgs || msgs.length === 0) return;
    const firstUserMsg = msgs.find((m) => m.role === 'user');
    const title = firstUserMsg ? generateConversationTitle(firstUserMsg.content) : 'Campus Inquiry';

    const currentConv = {
      id: convId,
      title,
      messages: msgs,
      updatedAt: createTimestamp(),
    };

    saveConversation(currentConv);

    setConversations((prev) => {
      const idx = prev.findIndex((c) => c.id === convId);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = currentConv;
        return copy;
      }
      return [currentConv, ...prev];
    });
  }, []);

  // Scroll detection
  const handleScroll = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBottom(distanceFromBottom > 120);
  };

  const scrollToBottom = (smooth = true) => {
    messagesEndRef.current?.scrollIntoView({
      behavior: smooth ? 'smooth' : 'auto',
      block: 'end',
    });
  };

  // Auto-scroll when messages or loading changes
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) {
      scrollToBottom(false);
      return;
    }
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distanceFromBottom < 150) {
      scrollToBottom(true);
    }
  }, [messages, isLoading]);

  // Handle new conversation
  const handleNewChat = useCallback(() => {
    if (isLoading && abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const newId = createId('conv');
    setActiveConversationId(newId);
    setMessages([]);
    setInput('');
    setStatus('ready');
  }, [isLoading]);

  // Select an existing conversation
  const handleSelectConversation = useCallback((id) => {
    const saved = getSavedConversations();
    const target = saved.find((c) => c.id === id);
    if (target) {
      setActiveConversationId(target.id);
      setMessages(target.messages || []);
      setInput('');
    }
  }, []);

  // Delete an existing conversation
  const handleDeleteConversation = useCallback(
    (id) => {
      const updated = deleteConversation(id);
      setConversations(updated);
      if (activeConversationId === id) {
        handleNewChat();
      }
    },
    [activeConversationId, handleNewChat]
  );

  // Clear all conversations
  const handleClearAll = useCallback(() => {
    clearAllConversations();
    setConversations([]);
    handleNewChat();
  }, [handleNewChat]);

  // Send message workflow
  const handleSendMessage = async (textToSend) => {
    const queryText = (textToSend || input).trim();
    if (!queryText || isLoading) return;

    setInput('');

    const userMessage = {
      id: createId('user'),
      role: 'user',
      content: queryText,
      timestamp: createTimestamp(),
    };

    const currentHistory = [...messages, userMessage];
    setMessages(currentHistory);
    syncConversation(activeConversationId, currentHistory);
    setIsLoading(true);
    setStatus('loading');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await sendChatMessage(queryText, currentHistory, controller.signal);

      const botMessage = {
        id: createId('bot'),
        role: 'assistant',
        content: response.answer,
        sources: response.sources || [],
        timestamp: response.timestamp,
      };

      const finalHistory = [...currentHistory, botMessage];
      setMessages(finalHistory);
      syncConversation(activeConversationId, finalHistory);
      setStatus('ready');
    } catch (err) {
      if (err.name === 'AbortError') return;

      console.error('Chat error:', err);
      const isOffline = Boolean(err.isOffline);
      setStatus(isOffline ? 'offline' : 'ready');

      const errorMessage = {
        id: createId('err'),
        role: 'assistant',
        error: true,
        content:
          err.message ||
          'Failed to retrieve campus information. Please verify your connection to the WCE RAG service.',
        failedPrompt: queryText,
        timestamp: createTimestamp(),
      };

      const errorHistory = [...currentHistory, errorMessage];
      setMessages(errorHistory);
      syncConversation(activeConversationId, errorHistory);
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  // Retry failed prompt
  const handleRetry = (failedMsg) => {
    if (!failedMsg || !failedMsg.failedPrompt) return;
    const filtered = messages.filter((m) => m.id !== failedMsg.id);
    setMessages(filtered);
    handleSendMessage(failedMsg.failedPrompt);
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="wce-app-root">
        {/* Chat History Sidebar Drawer */}
        <ChatSidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelectConversation={handleSelectConversation}
          onNewChat={handleNewChat}
          onDeleteConversation={handleDeleteConversation}
          onClearAll={handleClearAll}
        />

        {/* Main Content Layout */}
        <div className="wce-main-layout">
          {/* Header */}
          <ChatHeader
            theme={theme}
            onToggleTheme={toggleTheme}
            onNewChat={handleNewChat}
            onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
            status={status}
            isSidebarOpen={isSidebarOpen}
          />

          {/* Offline Banner when backend service is unreachable */}
          {status === 'offline' && (
            <div className="offline-banner" role="alert">
              <AlertTriangle size={15} aria-hidden="true" />
              <span>
                Backend RAG service is unreachable. Ensure the backend server is running on{' '}
                <code>http://localhost:5000</code> or check your <code>VITE_API_URL</code>.
              </span>
              <button
                type="button"
                className="offline-check-btn"
                onClick={() => {
                  checkBackendHealth().then((isHealthy) => {
                    setStatus(isHealthy ? 'ready' : 'offline');
                  });
                }}
              >
                Check Again
              </button>
            </div>
          )}

          {/* Conversation Area */}
          <main
            ref={scrollContainerRef}
            className="wce-chat-viewport"
            onScroll={handleScroll}
            aria-label="Conversation feed"
          >
            <div className="wce-chat-container">
              {messages.length === 0 ? (
                <WelcomeScreen onSelectPrompt={(prompt) => handleSendMessage(prompt)} />
              ) : (
                <div className="message-list">
                  {messages.map((msg) => (
                    <ChatMessage
                      key={msg.id}
                      message={msg}
                      onRetry={() => handleRetry(msg)}
                    />
                  ))}

                  {/* Typing Indicator */}
                  {isLoading && <TypingIndicator />}
                  <div ref={messagesEndRef} className="scroll-anchor" />
                </div>
              )}
            </div>
          </main>

          {/* Floating Scroll-to-Bottom Button */}
          <AnimatePresence>
            {showScrollBottom && (
              <motion.button
                type="button"
                className="scroll-bottom-btn"
                onClick={() => scrollToBottom(true)}
                initial={{ opacity: 0, scale: 0.8, y: 10 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: 10 }}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.92 }}
                aria-label="Scroll to newest messages"
                title="Scroll to bottom"
              >
                <ArrowDown size={17} aria-hidden="true" />
              </motion.button>
            )}
          </AnimatePresence>

          {/* Message Composer Footer */}
          <footer className="wce-composer-footer">
            <div className="composer-shell">
              <ChatInput
                input={input}
                setInput={setInput}
                onSend={handleSendMessage}
                isLoading={isLoading}
                disabled={false}
              />
              <p className="composer-disclaimer">
                WCE Campus Assistant provides information retrieved from Walchand College of
                Engineering documents. Always verify critical academic or examination details with
                official college notices.
              </p>
            </div>
          </footer>
        </div>
      </div>
    </MotionConfig>
  );
}

export default App;
