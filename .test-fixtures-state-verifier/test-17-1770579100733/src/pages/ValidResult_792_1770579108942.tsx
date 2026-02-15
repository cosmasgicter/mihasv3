import React, { Suspense } from 'react';
import { Skeleton } from '@/components/ui/Skeleton';

export function Profile() {
  const { data: userData, isLoading: userLoading } = useAuth();
  
  {isLoading && <Skeleton className="h-10 w-full" />}
  
  
  
  return (
    <div><h1>Profile</h1></div>
  );
}

export default Profile;
