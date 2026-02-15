import React, { Suspense } from 'react';
import { Loader } from '@/components/ui/Loader';

export function Settings() {
  
  
  <Suspense fallback={<div>Loading...</div>}>
  {isLoading && <Loader />}
  
  {!data?.length && <p>"No results found"</p>}
  
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div><h1>Settings</h1></div>
    </Suspense>
  );
}

export default Settings;
