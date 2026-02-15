import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Applications() {
  const { isLoading } = useQuery({
    queryKey: ['payments'],
    queryFn: () => fetch('/api/payments').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  
  
  if (!data) {
    return <div>No data</div>;
  }
  
  return (
    <div><h1>Applications</h1></div>
  );
}

export default Applications;
