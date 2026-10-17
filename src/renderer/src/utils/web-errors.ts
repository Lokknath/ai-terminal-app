export function describeWebLoadError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || '')
  if (/ERR_CONNECTION_REFUSED/i.test(message)) {
    return 'Could not connect. Check that the site or local server is running, then try again.'
  }
  if (/ERR_NAME_NOT_RESOLVED/i.test(message)) {
    return 'This address could not be found. Check the spelling and try again.'
  }
  if (/ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED/i.test(message)) {
    return 'The network connection is unavailable. Reconnect and try again.'
  }
  return 'This page could not be loaded. Check the address or connection, then try again.'
}
