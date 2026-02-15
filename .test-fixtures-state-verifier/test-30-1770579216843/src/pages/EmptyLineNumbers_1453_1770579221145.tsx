import React, { Suspense } from 'react';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';

export function Profile() {
  
  
  <Button loading={isLoading}>Submit</Button>
  {isLoading && <Skeleton className="h-10 w-full" />}
  
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  {data?.length === 0 && <EmptyState message="No items" />}
  
  return (
    <div><h1>Profile</h1></div>
  );
}

export default Profile;
