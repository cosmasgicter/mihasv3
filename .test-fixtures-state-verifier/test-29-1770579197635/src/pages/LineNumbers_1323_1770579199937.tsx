import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader } from '@/components/ui/Loader';

export function Admin() {
  const { isLoading, isPending } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetch('/api/payments').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  {isLoading && <Loader />}
  if (isLoading) {
    return <div>Loading...</div>;
  }
  
  if (!data) {
    return <div>No data</div>;
  }
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
