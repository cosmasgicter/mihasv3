import React, { Suspense } from 'react';

export function Settings() {
  
  
  <Suspense fallback={<div>Loading...</div>}>
  if (isPending) {
    return <div>Loading...</div>;
  }
  
  if (isEmpty) {
    return <div>No data available</div>;
  }
  {!data?.length && <p>"No results found"</p>}
  
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <div><h1>Settings</h1></div>
    </Suspense>
  );
}

export default Settings;
