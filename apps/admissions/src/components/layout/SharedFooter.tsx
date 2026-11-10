/**
 * SharedFooter - Single source of truth for footer content across all public pages.
 * Extracted from LandingPage's inline FooterSection.
 *
 * @requirements 16.1, 16.3, 3.5, 3.6
 */

import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, Mail, Phone, MapPin } from '@/components/icons';
import { BuildVersionBadge } from '@/components/ui/BuildVersionBadge';
import { cn } from '@/lib/utils';
import { contactInfo, quickLinks, socialLinks } from '@/lib/constants/landing';
import { usePortalBrand } from '@/hooks/usePortalBrand';
import { resolveTenantSupportContact } from '@/lib/tenantSupport';

interface SharedFooterProps {
  className?: string;
}

function smoothScrollToSection(sectionId: string) {
  document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function SharedFooter({ className }: SharedFooterProps) {
  const location = useLocation();
  const isLandingPage = location.pathname === '/';
  /*
    Whose contact details these are (admissions-v2 task 11.5, finding STU-24).

    This footer printed the **platform's** admissions phone, support phone and two
    platform inboxes on every public page — including a resolved tenant's own
    tracker, where "Admissions: +260 …" pointed an applicant at Beanola rather
    than at the school they applied to.

    Beanola's details are correct on the neutral shared portal, because there
    Beanola *is* the admissions party. On a resolved tenant host the block becomes
    that school's own affordance, through the same `resolveTenantSupportContact`
    every other student surface uses. The platform attribution line below is
    unaffected: that is who built the product, on any host.
  */
  const { brandName, isWhiteLabel, supportEmail } = usePortalBrand();
  const tenantSupport = resolveTenantSupportContact({ supportEmail, brandName });
  const showTenantContact = isWhiteLabel && tenantSupport.kind === 'tenant_email';

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
              <img
                src="/images/logos/beanolalogo.webp"
                alt="Beanola Admissions"
                width={32}
                height={32}
                loading="lazy"
                decoding="async"
                className="h-6 w-6 sm:h-8 sm:w-8 rounded bg-card p-0.5"
              />
              <span className="text-xl sm:text-2xl font-bold text-white">Beanola</span>
            </div>
            <h3 className="text-lg sm:text-xl font-semibold mb-4 text-white">Contact admissions</h3>
            {showTenantContact ? (
              <div className="space-y-2 text-sm text-white sm:text-base">
                <p className="text-white/80">{tenantSupport.description}</p>
                <a
                  href={tenantSupport.href}
                  className="flex min-h-touch items-center gap-2 text-white/80 transition-colors duration-150 hover:text-white hover:underline underline-offset-4"
                >
                  <Mail className="h-4 w-4 flex-shrink-0" />
                  <span>{tenantSupport.email}</span>
                </a>
              </div>
            ) : (
              <div className="space-y-2 text-sm text-white sm:text-base">
                <p className="flex items-start gap-2 text-white">
                  <MapPin className="h-4 w-4 mt-1 flex-shrink-0" />
                  <span className="text-white">{contactInfo.address}</span>
                </p>
                <a
                  href={`tel:${contactInfo.admissionsPhone.replace(/\s/g, '')}`}
                  className="flex min-h-touch items-center gap-2 text-white/80 transition-colors duration-150 hover:text-white hover:underline underline-offset-4"
                >
                  <Phone className="h-4 w-4 flex-shrink-0" />
                  <span><strong>Admissions:</strong> {contactInfo.admissionsPhone}</span>
                </a>
                <a
                  href={`mailto:${contactInfo.email}`}
                  className="flex min-h-touch items-center gap-2 text-white/80 transition-colors duration-150 hover:text-white hover:underline underline-offset-4"
                >
                  <Mail className="h-4 w-4 flex-shrink-0" />
                  <span>{contactInfo.email}</span>
                </a>
              </div>
            )}
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-lg sm:text-xl font-semibold mb-6 text-white">Quick links</h3>
            <ul className="space-y-3">
              {quickLinks.map((link) => (
                <li key={link.name}>
                  {link.href.startsWith('#') ? (
                    isLandingPage ? (
                      <a
                        href={link.href}
                        className="group flex min-h-touch items-center gap-2 text-sm text-white/80 transition-colors duration-150 hover:text-white hover:underline underline-offset-4 sm:text-base"
                        onClick={(event) => handleInPageAnchor(event, link.href.replace('#', ''))}
                      >
                        <ArrowRight className="h-4 w-4 opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
                        {link.name}
                      </a>
                    ) : (
                      <Link
                        to={`/${link.href}`}
                        className="group flex min-h-touch items-center gap-2 text-sm text-white/80 transition-colors duration-150 hover:text-white hover:underline underline-offset-4 sm:text-base"
                      >
                        <ArrowRight className="h-4 w-4 opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
                        {link.name}
                      </Link>
                    )
                  ) : (
                    <Link
                      to={link.href}
                      className="group flex min-h-touch items-center gap-2 text-sm text-white/80 transition-colors duration-150 hover:text-white hover:underline underline-offset-4 sm:text-base"
                    >
                      <ArrowRight className="h-4 w-4 opacity-0 transition-opacity duration-150 group-hover:opacity-100" />
                      {link.name}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Social profiles: only entries with a real profile URL (task 29.1) */}
          {socialLinks.length > 0 && (
          <div>
            <h3 className="text-lg sm:text-xl font-semibold mb-6 text-white">Follow us</h3>
            <div className="flex flex-wrap gap-2 sm:gap-4">
              {socialLinks.map((social) => (
                <a
                  key={social.name}
                  href={social.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-touch items-center gap-2 rounded-lg px-3 py-2 text-sm text-white transition-colors hover:bg-card/10 hover:text-white sm:px-4 sm:py-2 sm:text-base"
                  aria-label={`Follow us on ${social.name}`}
                >
                  <social.icon className="h-5 w-5" />
                  {social.name}
                </a>
              ))}
            </div>
          </div>
          )}
        </div>

        {/* Copyright */}
        <div className="border-t border-white/20 mt-8 sm:mt-12 pt-6 sm:pt-8 text-center">
          <p className="mb-2 text-sm text-white sm:text-base">
            &copy; {new Date().getFullYear()} Beanola. All rights reserved.
          </p>
          {/*
            No emoji in product copy (DESIGN.md: "Don't use emoji as structural
            icons"; PRODUCT.md: "No emoji icons"). The attribution is the
            attribution — task 11.5.
          */}
          <p className="text-sm text-white">
            Developed by{' '}
            <a
              href="https://beanola.com"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-touch items-center py-2 -my-2 font-semibold text-white underline-offset-4 hover:underline"
            >
              Beanola Technologies
            </a>
          </p>
          {import.meta.env.DEV && (
            <div className="mt-4 flex justify-center text-white/90">
              <BuildVersionBadge compact className="justify-center" />
            </div>
          )}
        </div>
      </div>
    </footer>
  );
}
