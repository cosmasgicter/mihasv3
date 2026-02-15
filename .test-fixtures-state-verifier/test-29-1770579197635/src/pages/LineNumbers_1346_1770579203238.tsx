import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader } from '@/components/ui/Loader';

export function Admin() {
  const { data } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => fetch('/api/catalog').then(res => res.json())
  });
  
  {isLoading && <Loader />}
  
  
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
