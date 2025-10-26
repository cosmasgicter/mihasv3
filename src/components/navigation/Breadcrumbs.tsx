import { ChevronRight, Home } from 'lucide-react';
import { Link } from 'react-router-dom';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  items: BreadcrumbItem[];
}

export function Breadcrumbs({ items }: BreadcrumbsProps) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center space-x-2" style={{ fontSize: 'var(--type-sm)' }}>
      <Link to="/" className="text-gray-900 hover:text-gray-900 transition-colors">
        <Home style={{ width: 'var(--icon-size-sm)', height: 'var(--icon-size-sm)' }} aria-label="Home" />
      </Link>
      {items.map((item, index) => (
        <div key={index} className="flex items-center space-x-2">
          <ChevronRight style={{ width: 'var(--icon-size-sm)', height: 'var(--icon-size-sm)' }} className="text-foreground" aria-hidden="true" />
          {item.href ? (
            <Link to={item.href} className="text-gray-900 hover:text-gray-900 transition-colors">
              {item.label}
            </Link>
          ) : (
            <span className="text-gray-900 font-medium" aria-current="page" style={{ fontSize: 'var(--type-sm)' }}>{item.label}</span>
          )}
        </div>
      ))}
    </nav>
  );
}
