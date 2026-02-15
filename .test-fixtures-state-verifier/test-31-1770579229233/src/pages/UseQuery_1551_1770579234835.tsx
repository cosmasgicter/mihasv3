
import React from 'react';
import { useQuery } from '@tanstack/react-query';

export function QueryPage() {
  const { isPending, error } = useQuery({
    queryKey: ['applications'],
    queryFn: () => fetch('/api/admin').then(res => res.json())
  });
  
  return <div>Test</div>;
}
