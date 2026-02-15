import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Applications() {
  const { data, error } = useQuery({
    queryKey: ['payments'],
    queryFn: () => fetch('/api/admin').then(res => res.json())
  });
  
  
  
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  if (isEmpty) {
    return <div>No data available</div>;
  }
  
  return (
    <div><h1>Applications</h1></div>
  );
}

export default Applications;
