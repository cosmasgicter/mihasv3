import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Settings() {
  
  
  if (isPending) {
    return <div>Loading...</div>;
  }
  <Button loading={isLoading}>Submit</Button>
  
  
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
