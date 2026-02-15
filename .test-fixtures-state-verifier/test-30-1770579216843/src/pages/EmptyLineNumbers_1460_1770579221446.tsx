import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Dashboard() {
  const { data } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => fetch('/api/catalog').then(res => res.json())
  });
  
  if (isLoading) {
    return <div>Loading...</div>;
  }
  if (isPending) {
    return <div>Loading...</div>;
  }
  
  {!data?.length && <p>"No results found"</p>}
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
