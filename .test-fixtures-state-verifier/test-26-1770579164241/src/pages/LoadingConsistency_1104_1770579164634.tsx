import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/Skeleton';

export function Admin() {
  
  
  {isLoading && <Skeleton className="h-10 w-full" />}
  
  
  
  return (
    <div><h1>Admin</h1></div>
  );
}

export default Admin;
