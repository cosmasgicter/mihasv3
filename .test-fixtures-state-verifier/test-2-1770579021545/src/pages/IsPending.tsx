
import React from 'react';
import { useQuery } from '@tanstack/react-query';

export function PendingPage() {
  const { data, isPending } = useQuery({
    queryKey: ['profile'],
    queryFn: () => fetch('/api/profile').then(res => res.json())
  });
  
  if (isPending) {
    return <div>Loading...</div>;
  }
  
  return <div>{JSON.stringify(data)}</div>;
}
