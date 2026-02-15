
import React from 'react';
import { useQuery } from '@tanstack/react-query';

export function TestPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['user'],
    queryFn: () => fetch('/api/health').then(res => res.json())
  });
  
  if (isLoading) {
    return <div>Loading...</div>;
  }
  
  return <div>{JSON.stringify(data)}</div>;
}
