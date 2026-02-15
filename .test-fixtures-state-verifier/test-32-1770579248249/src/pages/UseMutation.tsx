
import React from 'react';
import { useMutation } from '@tanstack/react-query';

export function MutationPage() {
  const { mutate, isPending } = useMutation({
    mutationFn: (data) => fetch('/api/applications', {
      method: 'POST',
      body: JSON.stringify(data)
    })
  });
  
  return <button onClick={() => mutate({})}>Submit</button>;
}
