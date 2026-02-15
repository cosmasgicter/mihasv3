import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Settings() {
  const { error } = useQuery({
    queryKey: ['documents'],
    queryFn: () => fetch('/api/admin').then(res => res.json())
  });
  
  <Suspense fallback={<div>Loading...</div>}>
  
  {!data?.length && <p>"No results found"</p>}
  {!data?.length && <p>"No results found"</p>}
  
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div><h1>Settings</h1></div>
    </Suspense>
  );
}

export default Settings;
