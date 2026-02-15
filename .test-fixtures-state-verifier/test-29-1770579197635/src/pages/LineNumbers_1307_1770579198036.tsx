import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Applications() {
  const { error } = useQuery({
    queryKey: ['profile'],
    queryFn: () => fetch('/api/catalog').then(res => res.json())
  });
  
  if (loading) {
    return <div>Loading...</div>;
  }
  
  
  
  return (
    <div><h1>Applications</h1></div>
  );
}

export default Applications;
