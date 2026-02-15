import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader } from '@/components/ui/Loader';

export function Dashboard() {
  const { isLoading, isPending } = useQuery({
    queryKey: ['sessions'],
    queryFn: () => fetch('/api/health').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  if (isPending) {
    return <div>Loading...</div>;
  }
  {isLoading && <Loader />}
  
  {!data?.length && <p>"No results found"</p>}
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
