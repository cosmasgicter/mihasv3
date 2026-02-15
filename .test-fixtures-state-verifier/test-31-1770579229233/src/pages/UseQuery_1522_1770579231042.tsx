
import React from 'react';
import { useQuery } from '@tanstack/react-query';

export function QueryPage() {
  const { isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => fetch('/api/payments').then(res => res.json())
  });
  
  return <div>Test</div>;
}
