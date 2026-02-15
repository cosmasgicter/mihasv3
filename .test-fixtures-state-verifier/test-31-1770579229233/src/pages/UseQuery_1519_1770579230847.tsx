
import React from 'react';
import { useQuery } from '@tanstack/react-query';

export function QueryPage() {
  const { isLoading, isPending, error } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/notifications').then(res => res.json())
  });
  
  return <div>Test</div>;
}
