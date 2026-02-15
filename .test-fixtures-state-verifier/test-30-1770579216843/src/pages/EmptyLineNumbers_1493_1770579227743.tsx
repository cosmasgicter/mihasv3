import React, { Suspense } from 'react';
import { Loader } from '@/components/ui/Loader';

export function Applications() {
  
  
  <Suspense fallback={<div>Loading...</div>}>
  {isLoading && <Loader />}
  
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div><h1>Applications</h1></div>
    </Suspense>
  );
}

export default Applications;
