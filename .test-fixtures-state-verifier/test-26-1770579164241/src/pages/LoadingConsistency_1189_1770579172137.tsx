import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Admin() {
  const { data, isLoading } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetch('/api/catalog').then(res => res.json())
  });
  const { isLoading, isPending } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetch('/api/payments').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  if (isLoading) {
    return <div>Loading...</div>;
  }
  <Button loading={isLoading}>Submit</Button>
  
  
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
