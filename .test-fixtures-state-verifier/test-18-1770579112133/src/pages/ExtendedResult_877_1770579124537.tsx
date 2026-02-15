import React, { Suspense } from 'react';

export function Settings() {
  const { data: userData, isLoading: userLoading } = useAuth();
  
  <Button loading={isLoading}>Submit</Button>
  
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
