import { useState } from 'react';
import { ExternalLink, FileText, ChevronDown, ChevronUp, Bookmark } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

/**
 * Renders a citation / retrieved document card according to backend RAG data
 */
export function SourceCard({ source, index }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!source) return null;

  const { title, url, page, section, snippet } = source;
  const hasDetails = Boolean(snippet || section || page);

  return (
    <div className="source-card">
      <div className="source-card-main">
        <div className="source-meta-row">
          <span className="source-badge">
            <FileText size={12} aria-hidden="true" />
            <span>Source {index + 1}</span>
          </span>

          {page && (
            <span className="source-tag" title="Page in document">
              <Bookmark size={11} aria-hidden="true" />
              Page {page}
            </span>
          )}

          {section && (
            <span className="source-tag section-tag" title="Section">
              {section}
            </span>
          )}
        </div>

        <div className="source-title-row">
          <h4 className="source-title" title={title}>
            {title}
          </h4>

          <div className="source-actions">
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="source-link-btn"
                aria-label={`Open external source: ${title}`}
                title="View original document"
              >
                <ExternalLink size={14} aria-hidden="true" />
              </a>
            )}

            {hasDetails && snippet && (
              <button
                type="button"
                className="source-expand-btn"
                onClick={() => setIsExpanded((prev) => !prev)}
                aria-expanded={isExpanded}
                aria-label={isExpanded ? 'Collapse source excerpt' : 'Expand source excerpt'}
                title={isExpanded ? 'Hide excerpt' : 'Show excerpt'}
              >
                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Expandable Snippet / Excerpt */}
      <AnimatePresence initial={false}>
        {isExpanded && snippet && (
          <motion.div
            key="excerpt"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="source-snippet-drawer"
          >
            <p className="source-snippet-text">{snippet}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default SourceCard;
