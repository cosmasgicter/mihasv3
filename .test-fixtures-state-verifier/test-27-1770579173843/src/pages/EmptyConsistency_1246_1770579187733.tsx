import React, { Suspense } from 'react';

export function Profile() {
  
  
  <Button loading={isLoading}>Submit</Button>
  
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  if (!data) {
    return <div>No data</div>;
  }
  
  return (
    <div><h1>Profile</h1></div>
  );
}

export default Profile;
