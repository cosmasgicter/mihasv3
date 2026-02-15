import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Applications() {
  
  
  <Suspense fallback={<div>Loading...</div>}>
  if (loading) {
    return <div>Loading...</div>;
  }
  
  if (isEmpty) {
    return <div>No data available</div>;
  }
  
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div><h1>Applications</h1></div>
    </Suspense>
  );
}

export default Applications;
