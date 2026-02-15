import React, { Suspense } from 'react';

export function Applications() {
  const { data: userData, isLoading: userLoading } = useAuth();
  
  
  
  
  
  return (
    <div><h1>Applications</h1></div>
  );
}

export default Applications;
