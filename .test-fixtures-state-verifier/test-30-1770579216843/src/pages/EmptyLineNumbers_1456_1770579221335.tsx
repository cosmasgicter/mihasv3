import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/Skeleton';

export function Admin() {
  
  
  {isLoading && <Skeleton className="h-10 w-full" />}
  <Button loading={isLoading}>Submit</Button>
  
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  if (isEmpty) {
    return <div>No data available</div>;
  }
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
