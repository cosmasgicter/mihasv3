import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/Skeleton';

export function Settings() {
  const { data: userData, isLoading: userLoading } = useAuth();
  
  {isLoading && <Skeleton className="h-10 w-full" />}
  <Button loading={isLoading}>Submit</Button>
  
  if (isEmpty) {
    return <div>No data available</div>;
  }
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
