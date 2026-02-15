import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Applications() {
  const { data, isLoading, isPending } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/catalog').then(res => res.json())
  });
  const { isLoading } = useQuery({
    queryKey: ['payments'],
    queryFn: () => fetch('/api/catalog').then(res => res.json())
  });
  
  if (isPending) {
    return <div>Loading...</div>;
  }
  
  
  
  return (
    <div><h1>Applications</h1></div>
  );
}

export default Applications;
