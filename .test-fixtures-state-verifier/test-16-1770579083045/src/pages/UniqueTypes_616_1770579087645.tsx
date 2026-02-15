import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader } from '@/components/ui/Loader';

export function Admin() {
  const { isLoading } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetch('/api/documents').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  if (isLoading) {
    return <div>Loading...</div>;
  }
  {isLoading && <Loader />}
  
  if (isEmpty) {
    return <div>No data available</div>;
  }
  {!data?.length && <p>"No results found"</p>}
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
