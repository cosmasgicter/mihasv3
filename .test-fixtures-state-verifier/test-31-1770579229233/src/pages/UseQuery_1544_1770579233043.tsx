
import React from 'react';
import { useQuery } from '@tanstack/react-query';

export function QueryPage() {
  const { data, isPending } = useQuery({
    queryKey: ['user'],
    queryFn: () => fetch('/api/notifications').then(res => res.json())
  });
  
  return <div>Test</div>;
}
