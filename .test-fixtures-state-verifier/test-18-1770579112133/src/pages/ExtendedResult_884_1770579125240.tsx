import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Dashboard() {
  const { data, error } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetch('/api/applications').then(res => res.json())
  });
  const { isLoading, isPending } = useQuery({
    queryKey: ['documents'],
    queryFn: () => fetch('/api/auth').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  if (loading) {
    return <div>Loading...</div>;
  }
  
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  {!data?.length && <p>"No results found"</p>}
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
