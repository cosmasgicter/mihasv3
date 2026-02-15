import React, { Suspense } from 'react';

export function Applications() {
  
  
  if (loading) {
    return <div>Loading...</div>;
  }
  <Button loading={isLoading}>Submit</Button>
  
  
  
  return (
    <div><h1>Applications</h1></div>
  );
}

export default Applications;
