const sanitize = (data: any) => {
  const sensitive = ['email', 'phone', 'address', 'password', 'token', 'authorization', 'nrc', 'passport'];
  return JSON.parse(JSON.stringify(data, (key, val) => 
    sensitive.some(s => key.toLowerCase().includes(s)) ? '[REDACTED]' : val
  ));
};

export const logger = {
  info: (msg: string, data?: any) => console.log(msg, data ? sanitize(data) : ''),
  error: (msg: string, err?: any) => console.error(msg, err ? sanitize(err) : ''),
  warn: (msg: string, data?: any) => console.warn(msg, data ? sanitize(data) : '')
};
