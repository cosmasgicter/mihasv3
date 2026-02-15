import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader } from '@/components/ui/Loader';

export function Settings() {
  
  
  if (isLoading) {
    return <div>Loading...</div>;
  }
  {isLoading && <Loader />}
  
  if (isEmpty) {
    return <div>No data available</div>;
  }
  if (!data) {
    return <div>No data</div>;
  }
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
