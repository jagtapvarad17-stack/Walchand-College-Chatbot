import { BookOpen, GraduationCap, Calendar, Building2, ArrowUpRight } from 'lucide-react';
import { motion } from 'motion/react';

const SUGGESTIONS = [
  {
    icon: GraduationCap,
    title: 'Academic Programs',
    question: 'What courses does WCE offer?',
    desc: 'B.Tech, M.Tech, and Ph.D. degree specializations',
  },
  {
    icon: BookOpen,
    title: 'Admissions & Eligibility',
    question: 'How can I find information about admissions?',
    desc: 'MHT-CET/JEE criteria, CAP rounds, and seat quotas',
  },
  {
    icon: Calendar,
    title: 'Academic Schedule',
    question: 'Where can I find the academic calendar?',
    desc: 'Semester timelines, examination dates, and holidays',
  },
  {
    icon: Building2,
    title: 'Campus & Facilities',
    question: 'Tell me about WCE departments and facilities.',
    desc: 'Laboratories, central library, hostels, and sports complex',
  },
];

// Motion animation variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 14 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: 'easeOut' },
  },
};

/**
 * WelcomeScreen component with prominent WCE logo and clean suggested query cards
 */
export function WelcomeScreen({ onSelectPrompt }) {
  return (
    <motion.div
      className="welcome-screen"
      variants={containerVariants}
      initial="hidden"
      animate="visible"
    >
      {/* Prominent WCE Crest Logo without star badges */}
      <motion.div className="welcome-logo-container" variants={itemVariants}>
        <div className="welcome-logo-plate">
          <img
            src="/wce-logo.png"
            alt="Walchand College of Engineering, Sangli"
            className="welcome-wce-logo"
          />
        </div>
      </motion.div>

      {/* Hero Typography */}
      <motion.div className="welcome-text-group" variants={itemVariants}>
        <h2 className="welcome-title">Your WCE Campus Assistant</h2>
        <p className="welcome-subtitle">
          Ask questions about Walchand College of Engineering, Sangli — from admissions and academic
          curricula to campus facilities, examinations, and departments.
        </p>
      </motion.div>

      {/* Suggested Query Cards */}
      <motion.div className="suggestions-grid" variants={containerVariants}>
        {SUGGESTIONS.map((item) => {
          const Icon = item.icon;
          return (
            <motion.button
              key={item.question}
              type="button"
              className="suggestion-card"
              variants={itemVariants}
              whileHover={{ y: -3, scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onSelectPrompt(item.question)}
            >
              <div className="suggestion-card-header">
                <div className="suggestion-icon-box">
                  <Icon size={18} className="suggestion-icon" aria-hidden="true" />
                </div>
                <ArrowUpRight size={16} className="suggestion-arrow" aria-hidden="true" />
              </div>
              <div className="suggestion-body">
                <span className="suggestion-question">{item.question}</span>
                <span className="suggestion-desc">{item.desc}</span>
              </div>
            </motion.button>
          );
        })}
      </motion.div>
    </motion.div>
  );
}

export default WelcomeScreen;
