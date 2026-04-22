// Safe HTML rendering component to prevent XSS
import React from 'react'
import DOMPurify from 'dompurify'

interface SafeHtmlProps {
  html: string
  className?: string
  tag?: keyof JSX.IntrinsicElements
}

/**
 * Renders sanitized HTML using DOMPurify.
 * Use for trusted-but-untrusted content (e.g., admin-authored templates).
 */
export const SafeHtml: React.FC<SafeHtmlProps> = ({ 
  html, 
  className = '', 
  tag: Tag = 'div' 
}) => {
  const clean = DOMPurify.sanitize(html, { ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'br', 'p', 'ul', 'ol', 'li', 'span'], ALLOWED_ATTR: ['href', 'target', 'rel', 'class'] })
  return <Tag className={className} dangerouslySetInnerHTML={{ __html: clean }} />
}

/**
 * Renders plain text — all HTML is escaped by React.
 * Use for user-provided content that must never render as HTML.
 */
export const SafeText: React.FC<{ 
  text: string
  className?: string
  tag?: keyof JSX.IntrinsicElements
}> = ({ text, className = '', tag: Tag = 'span' }) => {
  return (
    <Tag className={className}>
      {text}
    </Tag>
  )
}
