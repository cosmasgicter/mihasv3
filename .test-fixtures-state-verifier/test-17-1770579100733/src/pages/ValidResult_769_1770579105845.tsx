import React, { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader } from '@/components/ui/Loader';

export function Settings() {
  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: () => fetch('/api/admin').then(res => res.json())
  });
  const { data, error } = useQuery({
    queryKey: ['profile'],
    queryFn: () => fetch('/api/applications').then(res => res.json())
  });
  const { data: userData, isLoading: userLoading } = useAuth();
  
  {isLoading && <Loader />}
  <Button loading={isLoading}>Submit</Button>
  
  {!data?.length && <p>"No results found"</p>}
  
  return (
    <div><h1>Settings</h1></div>
  );
}

export default Settings;
