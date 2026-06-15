import { useEffect } from 'react'

const DEFAULT_SITE_NAME = 'Beanola Admissions'
const DEFAULT_IMAGE = '/images/logos/beanolalogo.webp'

const resolveSiteUrl = () => {
  const configuredUrl = import.meta.env.VITE_APP_BASE_URL || import.meta.env.VITE_SITE_URL

  if (configuredUrl) {
    return configuredUrl.replace(/\/$/, '')
  }

  if (typeof window !== 'undefined' && window.location.origin) {
    return window.location.origin
  }

  return 'https://apply.beanola.com'
}

const buildAbsoluteUrl = (value: string, siteUrl: string) => {
  if (/^https?:\/\//i.test(value)) {
    return value
  }

  return `${siteUrl}${value.startsWith('/') ? value : `/${value}`}`
}

interface SeoProps {
  title: string
  description: string
  path?: string
  canonical?: string
  image?: string
  type?: 'website' | 'article'
  twitterCard?: 'summary' | 'summary_large_image'
  noindex?: boolean
  structuredData?: Record<string, unknown> | Array<Record<string, unknown>>
}

export function Seo({
  title,
  description,
  path = '/',
  canonical,
  image = DEFAULT_IMAGE,
  type = 'website',
  twitterCard = 'summary_large_image',
  noindex = false,
  structuredData,
}: SeoProps) {
  useEffect(() => {
    const siteUrl = resolveSiteUrl()
    const canonicalUrl = canonical || buildAbsoluteUrl(path, siteUrl)
    const imageUrl = buildAbsoluteUrl(image, siteUrl)

    document.title = title

    const ensureMeta = (name: string, content: string, attribute: 'name' | 'property' = 'name') => {
      let element = document.head.querySelector<HTMLMetaElement>(`meta[${attribute}="${name}"]`)
      if (!element) {
        element = document.createElement('meta')
        element.setAttribute(attribute, name)
        document.head.appendChild(element)
      }
      element.setAttribute('content', content)
    }

    const ensureLink = (rel: string, href: string) => {
      let element = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
      if (!element) {
        element = document.createElement('link')
        element.setAttribute('rel', rel)
        document.head.appendChild(element)
      }
      element.setAttribute('href', href)
    }

    ensureMeta('description', description)
    ensureLink('canonical', canonicalUrl)

    ensureMeta('og:type', type, 'property')
    ensureMeta('og:title', title, 'property')
    ensureMeta('og:description', description, 'property')
    ensureMeta('og:url', canonicalUrl, 'property')
    ensureMeta('og:image', imageUrl, 'property')
    ensureMeta('og:site_name', DEFAULT_SITE_NAME, 'property')

    ensureMeta('twitter:card', twitterCard)
    ensureMeta('twitter:title', title)
    ensureMeta('twitter:description', description)
    ensureMeta('twitter:image', imageUrl)
    ensureMeta('twitter:url', canonicalUrl)

    ensureMeta('robots', noindex ? 'noindex, nofollow' : 'index, follow')

    const scriptId = 'route-json-ld'
    let jsonLdNode = document.getElementById(scriptId) as HTMLScriptElement | null

    if (structuredData) {
      if (!jsonLdNode) {
        jsonLdNode = document.createElement('script')
        jsonLdNode.id = scriptId
        jsonLdNode.type = 'application/ld+json'
        document.head.appendChild(jsonLdNode)
      }
      jsonLdNode.textContent = JSON.stringify(structuredData)
    } else if (jsonLdNode) {
      jsonLdNode.remove()
    }
  }, [canonical, description, image, noindex, path, structuredData, title, twitterCard, type])

  return null
}
