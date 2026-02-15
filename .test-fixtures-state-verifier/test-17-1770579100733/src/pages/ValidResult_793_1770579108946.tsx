import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Dashboard() {
  const { isLoading } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetch('/api/notifications').then(res => res.json())
  });
  const { data } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetch('/api/documents').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  
  
  
  
  return (
    <div><h1>Dashboard</h1></div>
  );
}

export default Dashboard;
