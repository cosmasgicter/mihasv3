import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Applications() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['documents'],
    queryFn: () => fetch('/api/admin').then(res => res.json())
  });
  const { isLoading, error } = useQuery({
    queryKey: ['applications'],
    queryFn: () => fetch('/api/documents').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  
  
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
