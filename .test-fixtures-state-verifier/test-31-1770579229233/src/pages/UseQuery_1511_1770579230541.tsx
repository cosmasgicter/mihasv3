
import React from 'react';
import { useQuery } from '@tanstack/react-query';

export function QueryPage() {
  const { isPending, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/health').then(res => res.json())
  });
  
  return <div>Test</div>;
}
