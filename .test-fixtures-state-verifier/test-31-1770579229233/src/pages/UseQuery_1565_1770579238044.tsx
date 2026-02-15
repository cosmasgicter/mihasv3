
import React from 'react';
import { useQuery } from '@tanstack/react-query';

export function QueryPage() {
  const { error } = useQuery({
    queryKey: ['documents'],
    queryFn: () => fetch('/api/documents').then(res => res.json())
  });
  
  return <div>Test</div>;
}
