import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Applications() {
  const { data } = useQuery({
    queryKey: ['user'],
    queryFn: () => fetch('/api/auth').then(res => res.json())
  });
  const { data, isLoading, error } = useQuery({
    queryKey: ['applications'],
    queryFn: () => fetch('/api/applications').then(res => res.json())
  });
  
  if (loading) {
    return <div>Loading...</div>;
  }
  
  
  
  return (
    <div><h1>Applications</h1></div>
  );
}

export default Applications;
