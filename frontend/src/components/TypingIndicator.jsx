import { motion } from 'motion/react';
import { Sparkles } from 'lucide-react';

const dotTransition = {
  duration: 0.7,
  repeat: Infinity,
  repeatType: 'reverse',
  ease: 'easeInOut',
};

/**
 * Animated typing indicator with 3 bouncing dots and AI status
 */
export function TypingIndicator() {
  return (
    <div
      className="typing-indicator-container"
      role="status"
      aria-live="polite"
      aria-label="Assistant is retrieving information"
    >
      <div className="typing-avatar">
        <Sparkles size={16} className="typing-sparkle" aria-hidden="true" />
      </div>

      <div className="typing-bubble">
        <span className="typing-label">Consulting WCE Knowledge Base</span>
        <div className="typing-dots">
          <motion.span
            className="typing-dot"
            animate={{ y: [-2, 4, -2], opacity: [0.4, 1, 0.4] }}
            transition={{ ...dotTransition, delay: 0 }}
          />
          <motion.span
            className="typing-dot"
            animate={{ y: [-2, 4, -2], opacity: [0.4, 1, 0.4] }}
            transition={{ ...dotTransition, delay: 0.18 }}
          />
          <motion.span
            className="typing-dot"
            animate={{ y: [-2, 4, -2], opacity: [0.4, 1, 0.4] }}
            transition={{ ...dotTransition, delay: 0.36 }}
          />
        </div>
      </div>
    </div>
  );
}

export default TypingIndicator;
