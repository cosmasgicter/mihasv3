
import React from 'react';
import { useQuery } from '@tanstack/react-query';

export function QueryPage() {
  const { error } = useQuery({
    queryKey: ['profile'],
    queryFn: () => fetch('/api/admin').then(res => res.json())
  });
  
  return <div>Test</div>;
}
