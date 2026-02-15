
import React, { useEffect, useState } from 'react';

export function UseEffectFetch() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    async function fetchData() {
      const response = await fetch('/api/applications');
      const json = await response.json();
      setData(json);
      setLoading(false);
    }
    fetchData();
  }, []);
  
  if (loading) {
    return <div>Loading...</div>;
  }
  
  return <div>{JSON.stringify(data)}</div>;
}
