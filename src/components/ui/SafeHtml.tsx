// Safe HTML rendering component to prevent XSS
import React from 'react'
import { sanitizeHtml } from '@/lib/security'

interface SafeHtmlProps {
  html: string
  className?: string
  tag?: keyof JSX.IntrinsicElements
}

export const SafeHtml: React.FC<SafeHtmlProps> = ({ 
  html, 
  className = '', 
  tag: Tag = 'div' 
}) => {
  const sanitizedHtml = sanitizeHtml(html)
  
  return (
    <Tag className={className}>
      {sanitizedHtml}
    </Tag>
  )
}

// Safe text component that escapes all HTML
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