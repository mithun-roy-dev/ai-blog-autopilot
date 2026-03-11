export const logUI = async (level: 'INFO' | 'DEBUG' | 'WARN' | 'ERROR', context: string, message: string, extra?: any) => {
  try {
    await fetch('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ level, context, message, extra })
    });
  } catch (e) {
    console.error('Failed to send UI log', e);
  }
};
