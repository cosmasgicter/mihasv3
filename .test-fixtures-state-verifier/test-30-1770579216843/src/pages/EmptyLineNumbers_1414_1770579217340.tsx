import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader } from '@/components/ui/Loader';
import { EmptyState } from '@/components/ui/EmptyState';

export function Settings() {
  const { data: userData, isLoading: userLoading } = useAuth();
  
  if (loading) {
    return <div>Loading...</div>;
  }
  {isLoading && <Loader />}
  
  if (isEmpty) {
    return <div>No data available</div>;
  }
  {data?.length === 0 && <EmptyState message="No items" />}
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
