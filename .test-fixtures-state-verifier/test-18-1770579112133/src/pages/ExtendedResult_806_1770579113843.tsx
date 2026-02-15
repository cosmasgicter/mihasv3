import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Dashboard() {
  const { isLoading, isPending, error } = useQuery({
    queryKey: ['payments'],
    queryFn: () => fetch('/api/payments').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  if (isLoading) {
    return <div>Loading...</div>;
  }
  <Button loading={isLoading}>Submit</Button>
  
  {!data?.length && <p>"No results found"</p>}
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
