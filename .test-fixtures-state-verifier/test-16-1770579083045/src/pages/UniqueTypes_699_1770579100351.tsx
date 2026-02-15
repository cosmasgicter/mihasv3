import React, { Suspense } from 'react';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';

export function Settings() {
  
  
  {isLoading && <Skeleton className="h-10 w-full" />}
  
  {data?.length === 0 && <EmptyState message="No items" />}
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
