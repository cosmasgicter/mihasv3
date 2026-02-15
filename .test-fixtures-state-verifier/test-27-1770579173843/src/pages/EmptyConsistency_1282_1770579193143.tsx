import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Applications() {
  const { isPending } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetch('/api/auth').then(res => res.json())
  });
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/admin').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  
  
  
  
  return (
    <div><h1>Applications</h1></div>
  );
}

export default Applications;
