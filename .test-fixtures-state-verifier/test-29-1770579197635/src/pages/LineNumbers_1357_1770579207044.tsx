import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Settings() {
  
  
  if (isLoading) {
    return <div>Loading...</div>;
  }
  if (isPending) {
    return <div>Loading...</div>;
  }
  
  
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
