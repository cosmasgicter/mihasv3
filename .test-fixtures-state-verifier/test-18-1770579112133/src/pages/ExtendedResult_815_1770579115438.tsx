import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';

export function Settings() {
  
  
  <Button loading={isLoading}>Submit</Button>
  
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
