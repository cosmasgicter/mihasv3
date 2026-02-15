
import React from 'react';
import { useQuery } from '@tanstack/react-query';

export function QueryPage() {
  const { isLoading } = useQuery({
    queryKey: ['user'],
    queryFn: () => fetch('/api/payments').then(res => res.json())
  });
  
  return <div>Test</div>;
}
