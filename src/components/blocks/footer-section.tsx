/**
 * FooterSection Component - ShadcnBlocks-style footer
 * Responsive footer with contact info, links, and social icons
 * 
 * @requirements 8.4, 8.5 - ShadcnBlocks page sections with design tokens
 */

import { cn } from '@/lib/utils';
import { 
  Mail, 
  Phone, 
  MapPin, 
  Facebook, 
  Twitter, 
  Instagram, 
  Linkedin,
  Youtube,
  ExternalLink
} from 'lucide-react';

interface FooterLink {
  label: string;
  href: string;
  external?: boolean;
}

interface FooterLinkGroup {
  title: string;
  links: FooterLink[];
}

interface SocialLink {
  platform: 'facebook' | 'twitter' | 'instagram' | 'linkedin' | 'youtube';
  href: string;
}

interface ContactInfo {
  email?: string;
  phone?: string;
  address?: string;
}

interface FooterSectionProps {
  logo?: React.ReactNode;
  description?: string;
  linkGroups?: FooterLinkGroup[];
  socialLinks?: SocialLink[];
  contactInfo?: ContactInfo;
  copyright?: string;
  variant?: 'default' | 'dark' | 'minimal';
  className?: string;
}

const socialIcons = {
  facebook: Facebook,
  twitter: Twitter,
  instagram: Instagram,
  linkedin: Linkedin,
  youtube: Youtube,
};

export function FooterSection({
  logo,
  description,
  linkGroups = [],
  socialLinks = [],
  contactInfo,
  copyright,
  variant = 'default',
  className,
}: FooterSectionProps) {
  const variantClasses = {
    default: 'bg-muted/50 border-t border-border',
    dark: 'bg-foreground text-background',
    minimal: 'border-t border-border',
  };

  const textClasses = {
    default: 'text-muted-foreground',
    dark: 'text-background/70',
    minimal: 'text-muted-foreground',
  };

  const headingClasses = {
    default: 'text-foreground',
    dark: 'text-background',
    minimal: 'text-foreground',
  };

  const linkClasses = {
    default: 'text-muted-foreground hover:text-foreground',
    dark: 'text-background/70 hover:text-background',
    minimal: 'text-muted-foreground hover:text-foreground',
  };

  return (
    <footer className={cn(variantClasses[variant], className)}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-12">
          {/* Brand column */}
          <div className="lg:col-span-1">
            {logo && <div className="mb-4">{logo}</div>}
            {description && (
              <p className={cn('text-sm leading-relaxed', textClasses[variant])}>
                {description}
              </p>
            )}
            
            {/* Social links */}
            {socialLinks.length > 0 && (
              <div className="flex gap-4 mt-6">
                {socialLinks.map((social, index) => {
                  const Icon = socialIcons[social.platform];
                  return (
                    <a
                      key={index}
                      href={social.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(
                        'flex items-center justify-center w-10 h-10 rounded-full transition-colors',
                        variant === 'dark' 
                          ? 'bg-background/10 hover:bg-background/20 text-background' 
                          : 'bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground'
                      )}
                      aria-label={`Follow us on ${social.platform}`}
                    >
                      <Icon className="h-5 w-5" />
                    </a>
                  );
                })}
              </div>
            )}
          </div>

          {/* Link groups */}
          {linkGroups.map((group, index) => (
            <div key={index}>
              <h3 className={cn('font-semibold mb-4', headingClasses[variant])}>
                {group.title}
              </h3>
              <ul className="space-y-3">
                {group.links.map((link, linkIndex) => (
                  <li key={linkIndex}>
                    <a
                      href={link.href}
                      target={link.external ? '_blank' : undefined}
                      rel={link.external ? 'noopener noreferrer' : undefined}
                      className={cn(
                        'text-sm transition-colors inline-flex items-center gap-1',
                        linkClasses[variant]
                      )}
                    >
                      {link.label}
                      {link.external && <ExternalLink className="h-3 w-3" />}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* Contact info */}
          {contactInfo && (
            <div>
              <h3 className={cn('font-semibold mb-4', headingClasses[variant])}>
                Contact Us
              </h3>
              <ul className="space-y-3">
                {contactInfo.email && (
                  <li>
                    <a
                      href={`mailto:${contactInfo.email}`}
                      className={cn(
                        'text-sm transition-colors inline-flex items-center gap-2',
                        linkClasses[variant]
                      )}
                    >
                      <Mail className="h-4 w-4" />
                      {contactInfo.email}
                    </a>
                  </li>
                )}
                {contactInfo.phone && (
                  <li>
                    <a
                      href={`tel:${contactInfo.phone}`}
                      className={cn(
                        'text-sm transition-colors inline-flex items-center gap-2',
                        linkClasses[variant]
                      )}
                    >
                      <Phone className="h-4 w-4" />
                      {contactInfo.phone}
                    </a>
                  </li>
                )}
                {contactInfo.address && (
                  <li className={cn('text-sm inline-flex items-start gap-2', textClasses[variant])}>
                    <MapPin className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>{contactInfo.address}</span>
                  </li>
                )}
              </ul>
            </div>
          )}
        </div>

        {/* Copyright */}
        {copyright && (
          <div className={cn('mt-12 pt-8 border-t', variant === 'dark' ? 'border-background/10' : 'border-border')}>
            <p className={cn('text-sm text-center', textClasses[variant])}>
              {copyright}
            </p>
          </div>
        )}
      </div>
    </footer>
  );
}

// Simple footer variant
interface SimpleFooterProps {
  links?: FooterLink[];
  copyright?: string;
  className?: string;
}

export function SimpleFooter({ links = [], copyright, className }: SimpleFooterProps) {
  return (
    <footer className={cn('border-t border-border py-8', className)}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          {links.length > 0 && (
            <nav className="flex flex-wrap justify-center gap-6">
              {links.map((link, index) => (
                <a
                  key={index}
                  href={link.href}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  {link.label}
                </a>
              ))}
            </nav>
          )}
          {copyright && (
            <p className="text-sm text-muted-foreground">
              {copyright}
            </p>
          )}
        </div>
      </div>
    </footer>
  );
}

export default FooterSection;
