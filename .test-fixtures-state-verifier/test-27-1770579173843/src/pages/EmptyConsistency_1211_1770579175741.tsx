import React, { Suspense } from 'react';

export function Applications() {
  
  
  <Suspense fallback={<div>Loading...</div>}>
  <Button loading={isLoading}>Submit</Button>
  
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  if (!data) {
    return <div>No data</div>;
  }
  
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div><h1>Applications</h1></div>
    </Suspense>
  );
}

export default Applications;
