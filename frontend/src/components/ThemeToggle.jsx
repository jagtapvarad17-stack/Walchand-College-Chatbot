import { Sun, Moon } from 'lucide-react';
import { motion } from 'motion/react';

/**
 * Accessible theme switcher component supporting Dark (Midnight Plum) and Light themes
 */
export function ThemeToggle({ theme, onToggle }) {
  const isDark = theme === 'dark';

  return (
    <motion.button
      type="button"
      className="theme-toggle-btn"
      onClick={onToggle}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`}
      title={`Switch to ${isDark ? 'light' : 'dark'} mode`}
    >
      <motion.div
        key={theme}
        initial={{ rotate: -45, opacity: 0, scale: 0.8 }}
        animate={{ rotate: 0, opacity: 1, scale: 1 }}
        exit={{ rotate: 45, opacity: 0, scale: 0.8 }}
        transition={{ duration: 0.22, ease: 'easeOut' }}
        className="theme-toggle-icon"
      >
        {isDark ? (
          <Sun size={19} className="sun-icon" aria-hidden="true" />
        ) : (
          <Moon size={19} className="moon-icon" aria-hidden="true" />
        )}
      </motion.div>
      <span className="theme-toggle-sr">Toggle theme</span>
    </motion.button>
  );
}

export default ThemeToggle;
