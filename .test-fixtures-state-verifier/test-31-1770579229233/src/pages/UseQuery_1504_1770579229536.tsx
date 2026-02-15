
import React from 'react';
import { useQuery } from '@tanstack/react-query';

export function QueryPage() {
  const { data, error } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetch('/api/health').then(res => res.json())
  });
  
  return <div>Test</div>;
}
