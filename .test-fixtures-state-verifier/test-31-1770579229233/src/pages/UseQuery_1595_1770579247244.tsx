
import React from 'react';
import { useQuery } from '@tanstack/react-query';

export function QueryPage() {
  const { data, isLoading, isPending, error } = useQuery({
    queryKey: ['user'],
    queryFn: () => fetch('/api/health').then(res => res.json())
  });
  
  return <div>Test</div>;
}
