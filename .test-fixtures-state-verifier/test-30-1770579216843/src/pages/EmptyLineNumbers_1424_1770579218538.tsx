import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Applications() {
  const { data, isLoading, isPending } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/notifications').then(res => res.json())
  });
  const { isPending, error } = useQuery({
    queryKey: ['documents'],
    queryFn: () => fetch('/api/payments').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  
  
  if (isEmpty) {
    return <div>No data available</div>;
  }
  
  return (
    <div><h1>Applications</h1></div>
  );
}

export default Applications;
