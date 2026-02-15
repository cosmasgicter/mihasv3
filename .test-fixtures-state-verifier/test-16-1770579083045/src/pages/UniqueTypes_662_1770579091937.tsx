import React, { Suspense } from 'react';
import { Skeleton } from '@/components/ui/Skeleton';

export function Settings() {
  
  
  <Button loading={isLoading}>Submit</Button>
  {isLoading && <Skeleton className="h-10 w-full" />}
  
  {data?.length > 0 ? <List items={data} /> : <EmptyPlaceholder />}
  {!data?.length && <p>"No results found"</p>}
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
