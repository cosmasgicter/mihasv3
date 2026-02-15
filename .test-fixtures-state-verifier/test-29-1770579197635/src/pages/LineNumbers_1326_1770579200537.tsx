import React, { Suspense } from 'react';
import { Skeleton } from '@/components/ui/Skeleton';

export function Applications() {
  
  
  {isLoading && <Skeleton className="h-10 w-full" />}
  
  
  
  return (
    <div><h1>Applications</h1></div>
  );
}

export default Applications;
