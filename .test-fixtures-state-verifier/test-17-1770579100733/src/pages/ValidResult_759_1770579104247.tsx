import React, { Suspense } from 'react';
import { EmptyState } from '@/components/ui/EmptyState';

export function Settings() {
  
  
  <Suspense fallback={<div>Loading...</div>}>
  
  {data?.length === 0 && <EmptyState message="No items" />}
  
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div><h1>Settings</h1></div>
    </Suspense>
  );
}

export default Settings;
