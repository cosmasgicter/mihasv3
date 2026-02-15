import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader } from '@/components/ui/Loader';

export function Settings() {
  const { data } = useQuery({
    queryKey: ['analytics'],
    queryFn: () => fetch('/api/payments').then(res => res.json())
  });
  const { isPending } = useQuery({
    queryKey: ['payments'],
    queryFn: () => fetch('/api/notifications').then(res => res.json())
  });
  
  {isLoading && <Loader />}
  if (isLoading) {
    return <div>Loading...</div>;
  }
  
  if (!data) {
    return <div>No data</div>;
  }
  if (isEmpty) {
    return <div>No data available</div>;
  }
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
