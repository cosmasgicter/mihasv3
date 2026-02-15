import React, { Suspense } from 'react';

export function Applications() {
  
  
  if (isPending) {
    return <div>Loading...</div>;
  }
  
  if (isEmpty) {
    return <div>No data available</div>;
  }
  
  return (
    <div><h1>Applications</h1></div>
  );
}

export default Applications;
