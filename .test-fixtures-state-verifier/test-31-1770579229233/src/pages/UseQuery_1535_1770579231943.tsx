
import React from 'react';
import { useQuery } from '@tanstack/react-query';

export function QueryPage() {
  const { data } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => fetch('/api/admin').then(res => res.json())
  });
  
  return <div>Test</div>;
}
