import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader } from '@/components/ui/Loader';

export function Settings() {
  const { data, isPending } = useQuery({
    queryKey: ['documents'],
    queryFn: () => fetch('/api/catalog').then(res => res.json())
  });
  const { data, isPending, error } = useQuery({
    queryKey: ['documents'],
    queryFn: () => fetch('/api/applications').then(res => res.json())
  });
  
  <Button loading={isLoading}>Submit</Button>
  {isLoading && <Loader />}
  
  {!data?.length && <p>"No results found"</p>}
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
