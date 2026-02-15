import React, { Suspense } from 'react';
import { Skeleton } from '@/components/ui/Skeleton';

export function Profile() {
  
  
  {isLoading && <Skeleton className="h-10 w-full" />}
  if (isPending) {
    return <div>Loading...</div>;
  }
  
  if (!data) {
    return <div>No data</div>;
  }
  {!data?.length && <p>"No results found"</p>}
  
  return (
    <div><h1>Profile</h1></div>
  );
}

export default Profile;
