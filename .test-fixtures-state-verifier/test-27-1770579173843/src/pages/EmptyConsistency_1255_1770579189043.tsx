import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Applications() {
  const { isPending } = useQuery({
    queryKey: ['documents'],
    queryFn: () => fetch('/api/catalog').then(res => res.json())
  });
  const { data, error } = useQuery({
    queryKey: ['user'],
    queryFn: () => fetch('/api/documents').then(res => res.json())
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
