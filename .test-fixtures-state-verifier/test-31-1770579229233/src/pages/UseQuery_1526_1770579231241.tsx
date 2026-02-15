
import React from 'react';
import { useQuery } from '@tanstack/react-query';

export function QueryPage() {
  const { isPending, error } = useQuery({
    queryKey: ['payments'],
    queryFn: () => fetch('/api/health').then(res => res.json())
  });
  
  return <div>Test</div>;
}
