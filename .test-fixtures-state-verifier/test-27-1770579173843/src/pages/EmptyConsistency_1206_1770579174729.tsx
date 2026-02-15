import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Applications() {
  const { data, error } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => fetch('/api/payments').then(res => res.json())
  });
  const { data, isLoading, isPending } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/payments').then(res => res.json())
  });
  
  
  
  
  
  return (
    <div><h1>Applications</h1></div>
  );
}

export default Applications;
