import React, { Suspense } from 'react';
import { Skeleton } from '@/components/ui/Skeleton';

export function Admin() {
  const { data: userData, isLoading: userLoading } = useAuth();
  
  if (isLoading) {
    return <div>Loading...</div>;
  }
  {isLoading && <Skeleton className="h-10 w-full" />}
  
  {!data?.length && <p>"No results found"</p>}
  if (!data) {
    return <div>No data</div>;
  }
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
