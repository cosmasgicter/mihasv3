import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader } from '@/components/ui/Loader';

export function Settings() {
  
  
  {isLoading && <Loader />}
  
  
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
