
import React from 'react';
import { useQuery } from '@tanstack/react-query';

export function QueryPage() {
  const { isPending } = useQuery({
    queryKey: ['documents'],
    queryFn: () => fetch('/api/health').then(res => res.json())
  });
  
  return <div>Test</div>;
}
