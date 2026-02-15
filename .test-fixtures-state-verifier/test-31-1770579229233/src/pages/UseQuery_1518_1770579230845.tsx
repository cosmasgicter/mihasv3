
import React from 'react';
import { useQuery } from '@tanstack/react-query';

export function QueryPage() {
  const { isLoading } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => fetch('/api/auth').then(res => res.json())
  });
  
  return <div>Test</div>;
}
