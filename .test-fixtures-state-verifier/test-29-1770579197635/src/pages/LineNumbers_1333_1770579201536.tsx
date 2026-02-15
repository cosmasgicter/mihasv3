import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Spinner } from '@/components/ui/Spinner';

export function Admin() {
  const { isLoading, isPending } = useQuery({
    queryKey: ['profile'],
    queryFn: () => fetch('/api/auth').then(res => res.json())
  });
  const { isLoading } = useQuery({
    queryKey: ['payments'],
    queryFn: () => fetch('/api/health').then(res => res.json())
  });
  
  {isLoading && <Spinner size="md" />}
  
  if (!data) {
    return <div>No data</div>;
  }
  if (!data) {
    return <div>No data</div>;
  }
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
