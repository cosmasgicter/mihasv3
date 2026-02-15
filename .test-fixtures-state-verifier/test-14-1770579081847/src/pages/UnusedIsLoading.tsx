
import React from 'react';
import { useQuery } from '@tanstack/react-query';

export function UnusedIsLoading() {
  const { data, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => fetch('/api/profile').then(res => res.json())
  });
  
  // isLoading is destructured but never used in a conditional
  return <div>{JSON.stringify(data)}</div>;
}
