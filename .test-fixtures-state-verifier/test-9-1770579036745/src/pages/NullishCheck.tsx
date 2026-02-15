
import React from 'react';
import { useQuery } from '@tanstack/react-query';

export function NullishPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['profile'],
    queryFn: () => fetch('/api/profile').then(res => res.json())
  });
  
  if (isLoading) return <div>Loading...</div>;
  
  if (!data) {
    return <div>No profile data</div>;
  }
  
  return <div>{data.name}</div>;
}
