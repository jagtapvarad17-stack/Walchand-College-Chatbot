const CONVERSATIONS_KEY = 'wce_saved_conversations';
const ACTIVE_CONV_ID_KEY = 'wce_active_conversation_id';

/**
 * Loads all stored conversations from localStorage
 * @returns {Array} List of conversations
 */
export function getSavedConversations() {
  try {
    const raw = localStorage.getItem(CONVERSATIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('Failed to load saved conversations:', err);
    return [];
  }
}

/**
 * Saves a list of conversations to localStorage
 * @param {Array} conversations
 */
export function persistConversations(conversations) {
  try {
    localStorage.setItem(CONVERSATIONS_KEY, JSON.stringify(conversations));
  } catch (err) {
    console.warn('Failed to persist conversations:', err);
  }
}

/**
 * Saves or updates a specific conversation
 * @param {Object} conversation
 */
export function saveConversation(conversation) {
  if (!conversation || !conversation.id) return;
  const list = getSavedConversations();
  const existingIdx = list.findIndex((c) => c.id === conversation.id);
  
  const updatedConversation = {
    ...conversation,
    updatedAt: new Date().toISOString(),
  };

  let nextList;
  if (existingIdx >= 0) {
    nextList = [...list];
    nextList[existingIdx] = updatedConversation;
  } else {
    nextList = [updatedConversation, ...list];
  }

  persistConversations(nextList);
  return updatedConversation;
}

/**
 * Deletes a conversation by ID
 * @param {string} id
 */
export function deleteConversation(id) {
  const list = getSavedConversations();
  const filtered = list.filter((c) => c.id !== id);
  persistConversations(filtered);
  return filtered;
}

/**
 * Clears all conversation history
 */
export function clearAllConversations() {
  try {
    localStorage.removeItem(CONVERSATIONS_KEY);
    localStorage.removeItem(ACTIVE_CONV_ID_KEY);
  } catch (err) {
    console.warn('Failed to clear conversations:', err);
  }
}

/**
 * Generates a clean preview title for a conversation based on the first message
 * @param {string} text
 * @returns {string}
 */
export function generateConversationTitle(text) {
  if (!text) return 'New Inquiry';
  const clean = text.trim().replace(/\s+/g, ' ');
  return clean.length > 38 ? clean.slice(0, 35) + '...' : clean;
}
