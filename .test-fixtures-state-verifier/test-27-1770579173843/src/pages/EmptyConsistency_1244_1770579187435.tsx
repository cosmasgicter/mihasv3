import React, { Suspense } from 'react';

export function Settings() {
  const { data: userData, isLoading: userLoading } = useAuth();
  
  if (isLoading) {
    return <div>Loading...</div>;
  }
  
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  if (isEmpty) {
    return <div>No data available</div>;
  }
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
