import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/Skeleton';

export function Settings() {
  
  
  {isLoading && <Skeleton className="h-10 w-full" />}
  <Button loading={isLoading}>Submit</Button>
  
  
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
