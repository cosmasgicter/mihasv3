
import React from 'react';
import { useQuery } from '@tanstack/react-query';

export function QueryPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['documents'],
    queryFn: () => fetch('/api/notifications').then(res => res.json())
  });
  
  return <div>Test</div>;
}
