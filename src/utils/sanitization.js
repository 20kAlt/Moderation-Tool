// sanitization.js

export function sanitizeMarkdown(text) {
  if (typeof text !== 'string') return '';
  
  return text
    .replace(/\*/g, '\\*')      
    .replace(/_/g, '\\_')       
    .replace(/`/g, '\\`')       
    .replace(/\[/g, '\\[')      
    .replace(/\]/g, '\\]')      
    .replace(/\|/g, '\\|')      
    .replace(/~/g, '\\~');      
}

export function sanitizeInput(input, maxLength = 2000) {
  if (typeof input !== 'string') return '';
  
  return input
    .trim()
    .substring(0, maxLength)
    .replace(/[\x00-\x1F\x7F]/g, '');  
}

export function sanitizeMention(mention) {
  const validId = mention.replace(/[<@!&#]/g, '');
  return /^\d+$/.test(validId) ? validId : null;
}

export function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  
  return text.replace(/[&<>"']/g, char => map[char]);
}