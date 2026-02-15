import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Applications() {
  
  
  if (isPending) {
    return <div>Loading...</div>;
  }
  if (isLoading) {
    return <div>Loading...</div>;
  }
  
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  
  return (
    <div><h1>Applications</h1></div>
  );
}

export default Applications;
