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
    <nav aria-label="Breadcrumb" className="flex items-center space-x-2 text-sm">
      <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors">
        <Home className="h-4 w-4" aria-label="Home" />
      </Link>
      {items.map((item, index) => (
        <div key={index} className="flex items-center space-x-2">
          <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          {item.href ? (
            <Link to={item.href} className="text-muted-foreground hover:text-foreground transition-colors">
              {item.label}
            </Link>
          ) : (
            <span className="text-foreground font-medium" aria-current="page">{item.label}</span>
          )}
        </div>
      ))}
    </nav>
  );
}
