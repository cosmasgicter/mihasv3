import React, { Suspense } from 'react';

export function Applications() {
  
  
  if (loading) {
    return <div>Loading...</div>;
  }
  
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  if (data?.length === 0) {
    return <div>No items found</div>;
  }
  
  return (
    <div><h1>Applications</h1></div>
  );
}

export default Applications;
