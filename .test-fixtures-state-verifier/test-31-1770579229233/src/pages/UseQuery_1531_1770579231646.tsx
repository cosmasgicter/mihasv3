
import React from 'react';
import { useQuery } from '@tanstack/react-query';

export function QueryPage() {
  const { isLoading, isPending } = useQuery({
    queryKey: ['applications'],
    queryFn: () => fetch('/api/health').then(res => res.json())
  });
  
  return <div>Test</div>;
}
