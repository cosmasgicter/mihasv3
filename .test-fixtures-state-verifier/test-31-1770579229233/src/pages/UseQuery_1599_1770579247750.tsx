
import React from 'react';
import { useQuery } from '@tanstack/react-query';

export function QueryPage() {
  const { isLoading, error } = useQuery({
    queryKey: ['profile'],
    queryFn: () => fetch('/api/documents').then(res => res.json())
  });
  
  return <div>Test</div>;
}
