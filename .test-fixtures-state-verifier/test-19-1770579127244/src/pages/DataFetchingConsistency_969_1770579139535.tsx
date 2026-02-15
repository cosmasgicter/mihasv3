import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Admin() {
  const { isLoading } = useQuery({
    queryKey: ['applications'],
    queryFn: () => fetch('/api/catalog').then(res => res.json())
  });
  
  
  
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
