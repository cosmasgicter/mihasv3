
import React from 'react';
import { useQuery } from '@tanstack/react-query';

export function DestructuredPage() {
  const { data, isLoading, error, isError, refetch } = useQuery({
    queryKey: ['profile'],
    queryFn: () => fetch('/api/profile').then(res => res.json())
  });
  
  if (isLoading) return <div>Loading...</div>;
  if (isError) return <div>Error: {error.message}</div>;
  
  return <div>{JSON.stringify(data)}</div>;
}
