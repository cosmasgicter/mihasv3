
import React from 'react';
import { useQuery } from '@tanstack/react-query';

export function QueryPage() {
  const { data, isPending, error } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetch('/api/applications').then(res => res.json())
  });
  
  return <div>Test</div>;
}
