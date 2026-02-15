import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Admin() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/health').then(res => res.json())
  });
  const { data, isLoading, isPending } = useQuery({
    queryKey: ['applications'],
    queryFn: () => fetch('/api/documents').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  if (isPending) {
    return <div>Loading...</div>;
  }
  
  {!data?.length && <p>"No results found"</p>}
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
