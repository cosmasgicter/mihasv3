import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Dashboard() {
  const { data } = useQuery({
    queryKey: ['profile'],
    queryFn: () => fetch('/api/documents').then(res => res.json())
  });
  const { isLoading, isPending } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/applications').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  <Suspense fallback={<div>Loading...</div>}>
  
  if (isEmpty) {
    return <div>No data available</div>;
  }
  {!data?.length && <p>"No results found"</p>}
  
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div><h1>Dashboard</h1></div>
    </Suspense>
  );
}

export default Dashboard;
