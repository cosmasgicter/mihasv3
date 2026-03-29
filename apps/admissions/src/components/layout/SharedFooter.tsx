/**
 * SharedFooter - Single source of truth for footer content across all public pages.
 * Extracted from LandingPage's inline FooterSection.
 *
 * @requirements 16.1, 16.3, 3.5, 3.6
 */

import { Link, useLocation } from 'react-router-dom';
import { GraduationCap, ArrowRight, Mail, Phone, MapPin } from '@/components/icons';
import { cn } from '@/lib/utils';
import { contactInfo, quickLinks, socialLinks } from '@/lib/constants/landing';

interface SharedFooterProps {
  className?: string;
}

function smoothScrollToSection(sectionId: string) {
  document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function SharedFooter({ className }: SharedFooterProps) {
  const location = useLocation();
  const isLandingPage = location.pathname === '/';

  const handleInPageAnchor = (event: React.MouseEvent<HTMLAnchorElement>, sectionId: string) => {
    if (!isLandingPage) return; // Let normal navigation happen on non-landing pages
    event.preventDefault();
    smoothScrollToSection(sectionId);
    window.history.replaceState({}, '', `#${sectionId}`);
  };

  return (
    <footer className={cn('bg-foreground text-white py-12 sm:py-16', className)}>
      <div className="container-responsive px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 sm:gap-12">
          {/* Contact Info */}
          <div>
            <div className="flex items-center space-x-2 mb-6">
              <GraduationCap className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
              <span className="text-xl sm:text-2xl font-bold gradient-text-primary">MIHAS-KATC</span>
            </div>
            <h3 className="text-lg sm:text-xl font-semibold mb-4">Apply Today - Contact Us</h3>
            <div className="space-y-2 text-white/90 text-sm sm:text-base">
              <p className="flex items-start gap-2">
                <MapPin className="h-4 w-4 mt-1 flex-shrink-0" />
                <span>{contactInfo.address}</span>
              </p>
              <a
                href={`tel:${contactInfo.katcPhone.replace(/\s/g, '')}`}
                className="flex items-center gap-2 hover:text-primary transition-colors"
              >
                <Phone className="h-4 w-4 flex-shrink-0" />
                <span><strong>KATC:</strong> {contactInfo.katcPhone}</span>
              </a>
              <a
                href={`tel:${contactInfo.mihasPhone.replace(/\s/g, '')}`}
                className="flex items-center gap-2 hover:text-primary transition-colors"
              >
                <Phone className="h-4 w-4 flex-shrink-0" />
                <span><strong>MIHAS:</strong> {contactInfo.mihasPhone}</span>
              </a>
              <a
                href={`mailto:${contactInfo.email}`}
                className="flex items-center gap-2 hover:text-primary transition-colors"
              >
                <Mail className="h-4 w-4 flex-shrink-0" />
                <span>{contactInfo.katcEmail} | {contactInfo.email}</span>
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-lg sm:text-xl font-semibold mb-6">Quick Links</h3>
            <ul className="space-y-3">
              {quickLinks.map((link) => (
                <li key={link.name}>
                  {link.href.startsWith('#') ? (
                    isLandingPage ? (
                      <a
                        href={link.href}
                        className="text-white/90 hover:text-primary transition-colors flex items-center group text-sm sm:text-base"
                        onClick={(event) => handleInPageAnchor(event, link.href.replace('#', ''))}
                      >
                        <ArrowRight className="w-4 h-4 mr-2 opacity-0 group-hover:opacity-100 transition-opacity" />
                        {link.name}
                      </a>
                    ) : (
                      <Link
                        to={`/${link.href}`}
                        className="text-white/90 hover:text-primary transition-colors flex items-center group text-sm sm:text-base"
                      >
                        <ArrowRight className="w-4 h-4 mr-2 opacity-0 group-hover:opacity-100 transition-opacity" />
                        {link.name}
                      </Link>
                    )
                  ) : (
                    <Link
                      to={link.href}
                      className="text-white/90 hover:text-primary transition-colors flex items-center group text-sm sm:text-base"
                    >
                      <ArrowRight className="w-4 h-4 mr-2 opacity-0 group-hover:opacity-100 transition-opacity" />
                      {link.name}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Social Links */}
          <div>
            <h3 className="text-lg sm:text-xl font-semibold mb-6">Follow Us</h3>
            <div className="flex flex-wrap gap-2 sm:gap-4">
              {socialLinks.map((social) => (
                <a
                  key={social.name}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/90 hover:text-primary transition-colors px-3 py-2 sm:px-4 sm:py-2 rounded-lg hover:bg-white/10 text-sm sm:text-base min-h-[44px] flex items-center gap-2"
                  aria-label={`Follow us on ${social.name}`}
                >
                  <social.icon className="h-5 w-5" />
                  {social.name}
                </a>
              ))}
            </div>
          </div>
        </div>

        {/* Copyright */}
        <div className="border-t border-white/20 mt-8 sm:mt-12 pt-6 sm:pt-8 text-center">
          <p className="text-white/90 mb-2 text-sm sm:text-base">
            &copy; {new Date().getFullYear()} MIHAS-KATC. All rights reserved.
          </p>
          <p className="text-white/70 text-sm">
            Developed with ❤️ by{' '}
            <a
              href="https://beanola.com"
              target="_blank"
              rel="noopener noreferrer"
              className="gradient-text-primary font-semibold hover:underline"
            >
              Beanola Technologies
            </a>
          </p>
        </div>
      </div>
    </footer>
  );
}
